/**
 * Sound quality 1 — hand-programmed GM instruments (programs 0-31 so far)
 * ======================================================================
 * Every program is a small "patch": a function that describes the instrument
 * from physical building blocks, instead of looping one recorded wavetable
 * cycle through a generic ADSR. Programs that are not listed in PATCHES simply
 * return false from hasSynthInstrument() and create-note.js keeps using the
 * wavetable path for them.
 *
 * Building blocks (see the `b` builder passed to every patch):
 *   part()    an oscillator: PeriodicWave with a designed spectrum (pluck
 *             position comb, drawbars, reed formant ...), its own detune and
 *             multi-stage decay, optional FM modulators (tines, bells).
 *   noise()   filtered noise burst/bed: hammer, pick, key click, breath, chiff.
 *   master()  gate envelope: attack, sustain decay, release (analytic, so a
 *             note-off in the middle of a decay releases from the right level).
 *   filt()    the per-note lowpass: brightness follows velocity and decays
 *             (piano, plucks) or follows expression (sustained sounds).
 *   eq()      extra biquads (body / formant resonances).
 *   lfo()     shared vibrato (cents) and tremolo (organ rotary, vibraphone motor).
 *   drive()   waveshaper for overdriven / distorted guitars.
 *
 * Everything is routed into the base note's pan input, so velocity, expression
 * (CC11), pan, reverb/chorus sends, pitch bend, modulation (CC1) and node
 * cleanup behave exactly as for every other note.
 *
 * Balance: TRIM_DB[program] (dB) is calibrated from offline RMS renders at
 * C4/C5, velocity 100; fine-tune the last dB by ear.
 */

const TRIM_DB = {
    0: +1.0, 1: +2.8, 2: +0.7, 3: +1.2, 4: +0.7, 5: +0.2, 6: +3.9, 7: +2.1,
    8: -0.9, 9: -0.9, 10: -0.6, 11: -0.9, 12: 0, 13: +0.7, 14: -1.6, 15: +2.4,
    16: +0.5, 17: -0.2, 18: +1.0, 19: +0.8, 20: -0.3, 21: -1.2, 22: -1.2, 23: -1.4,
    24: -0.2, 25: +2.6, 26: -1.3, 27: +1.7, 28: +1.9, 29: +5.0, 30: +4.4, 31: -0.6,
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function dbToGain(db) { return Math.pow(10, db / 20); }
/** register scaling: 2^((ref-p)/per): 1 at ref, doubles every `per` semitones downwards */
function K(p, ref, per) { return Math.pow(2, (ref - p) / per); }

const TAIL = 6.9;                     // time constants to reach -60 dB
const REF_NOISE_RMS = 0.5774;

const noiseNorms = typeof WeakMap !== "undefined" ? new WeakMap() : null;
function noiseNorm(buf) {
    let n = noiseNorms && noiseNorms.get(buf);
    if (n) return n;
    const d = buf.getChannelData(0);
    let sum = 0, cnt = 0;
    for (let i = 0; i < d.length; i += 3) { sum += d[i] * d[i]; cnt++; }
    const rms = Math.sqrt(sum / Math.max(1, cnt));
    n = rms > 1e-6 ? REF_NOISE_RMS / rms : 1;
    if (noiseNorms) noiseNorms.set(buf, n);
    return n;
}

/* ---- PeriodicWave cache: one wave per (design, octave band) ---- */
const waveCaches = typeof WeakMap !== "undefined" ? new WeakMap() : null;

/**
 * A wave design: key identifies it, h(n, bandPitch) returns the amplitude of
 * harmonic n (1-based). Returns {pw, gain}: gain equalises RMS between designs
 * (createPeriodicWave normalises the PEAK to 1, so peaky spectra would be quiet).
 */
function getPeriodic(ctx, design, pitch) {
    const band = clamp(Math.floor(pitch / 12), 0, 10);
    const key = design.key + "|" + band;
    let m = waveCaches && waveCaches.get(ctx);
    if (!m) { m = {}; if (waveCaches) waveCaches.set(ctx, m); }
    if (m[key]) return m[key];
    const bp = band * 12 + 6;
    const fLow = 440 * Math.pow(2, (band * 12 - 69) / 12);
    const N = clamp(Math.floor(Math.min(ctx.sampleRate * 0.45, 18000) / Math.max(fLow, 8)), 8, design.maxN || 160);
    const real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
    const amps = new Float32Array(N + 1);
    for (let n = 1; n <= N; n++) {
        const a = Math.max(0, design.h(n, bp));
        amps[n] = a;
        imag[n] = a;
    }
    // RMS / peak of the (sine-phase) waveform, to equalise loudness between designs
    let peak = 1e-9, sq = 0;
    const S = 512;
    for (let i = 0; i < S; i++) {
        const th = 2 * Math.PI * i / S;
        let w = 0;
        for (let n = 1; n <= N; n++) if (amps[n] > 0) w += amps[n] * Math.sin(n * th);
        if (Math.abs(w) > peak) peak = Math.abs(w);
        sq += w * w;
    }
    const rms = Math.sqrt(sq / S);
    const e = { pw: ctx.createPeriodicWave(real, imag), gain: 0.3 / Math.max(rms / peak, 0.05) };
    m[key] = e;
    return e;
}

const shaperCurves = {};
function getCurve(k) {
    const key = k.toFixed(2);
    if (shaperCurves[key]) return shaperCurves[key];
    const n = 2049, c = new Float32Array(n), norm = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(k * x) / norm; }
    shaperCurves[key] = c;
    return c;
}

/**
 * Value of an exponential multi-stage envelope at time t (seconds after the
 * attack). stages = [[at, target, tau], ...]; before the first stage the value is 1.
 */
function stageValue(stages, t) {
    let v = 1, cur = { to: 1, tau: Infinity, t: 0 };
    for (let i = 0; i < stages.length; i++) {
        const st = stages[i];
        if (t < st[0]) break;
        v = cur.to + (v - cur.to) * Math.exp(-(st[0] - cur.t) / cur.tau);
        cur = { to: st[1], tau: st[2], t: st[0] };
    }
    return cur.to + (v - cur.to) * Math.exp(-(t - cur.t) / cur.tau);
}

/** normalise a decay spec to stages; a number means "decay to 0 with this time constant" */
function toStages(decay) {
    if (decay == null) return [];
    return typeof decay === "number" ? [[0, 0, decay]] : decay;
}

/** time (s after the attack) at which a stage list is inaudible (-60 dB), Infinity if it sustains */
function stagesEnd(stages) {
    if (!stages.length) return Infinity;
    const last = stages[stages.length - 1];
    return last[1] === 0 ? last[0] + TAIL * last[2] : Infinity;
}

/** schedule the stages that begin before `until` (absolute) on a param whose attack ended at t1 */
function scheduleStages(param, t1, peak, stages, until) {
    for (let i = 0; i < stages.length; i++) {
        const st = stages[i], ts = t1 + st[0];
        if (ts >= until) break;
        // explicit hold before the first stage: a ramp's end value is not
        // guaranteed to be held by every engine until a later setTarget starts
        if (i === 0 && st[0] > 0) param.setValueAtTime(peak, ts);
        param.setTargetAtTime(st[1] * peak, ts, st[2]);
    }
}

/* ------------------------------------------------------------------ */
/* wave designs                                                        */
/* ------------------------------------------------------------------ */

/** struck / plucked string: n^-expo rolloff with a comb notch from the strike/pluck position */
function stringWave(pos, expo, soft) {
    const s = soft == null ? 0.2 : soft;
    return {
        key: "str" + pos + "_" + expo + "_" + s,
        h: function (n, bp) {
            const comb = s + (1 - s) * Math.abs(Math.sin(Math.PI * n * pos));
            // register: high notes have steeper spectra; low piano notes have a weak fundamental
            const ex = expo + 0.06 * Math.max(0, (bp - 60) / 12);
            const fund = n === 1 ? clamp((bp - 24) / 40, 0.3, 1) : 1;
            return Math.pow(n, -ex) * comb * fund;
        },
    };
}

/** sparse additive spectrum: list of [harmonic, amp] */
function addWave(key, list, maxN) {
    const m = {};
    list.forEach(function (e) { m[e[0]] = e[1]; });
    return { key: key, maxN: maxN || 32, h: function (n) { return m[n] || 0; } };
}

/** Hammond tonewheel drawbars 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1' (0-8), fundamental = 16' */
function drawbarWave(bars) {
    const idx = [1, 3, 2, 4, 6, 8, 10, 12, 16];
    const list = [];
    bars.forEach(function (x, i) { if (x > 0) list.push([idx[i], Math.pow(10, (x - 8) * 3 / 20)]); });
    return addWave("dbar" + bars.join(""), list, 16);
}

/** reed: n^-expo with a formant bump (Hz) */
function reedWave(expo, formant, width, boost, even) {
    return {
        key: "reed" + expo + "_" + formant + "_" + width + "_" + boost + "_" + even,
        h: function (n, bp) {
            const f = 440 * Math.pow(2, (bp - 69) / 12) * n;
            const bump = 1 + boost * Math.exp(-Math.pow((f - formant) / width, 2));
            return Math.pow(n, -expo) * bump * (n % 2 === 0 ? even : 1);
        },
    };
}

/* ------------------------------------------------------------------ */
/* patches                                                             */
/* b = builder, c = { p: MIDI pitch, f: Hz, vel: 0..1, len: note seconds, ... }  */
/* ------------------------------------------------------------------ */

const PATCHES = {};

/* ---- pianos (0-3) -------------------------------------------------- */
function piano(o) {
    return function (b, c) {
        const p = c.p, f = c.f, vel = c.vel;
        const Kd = clamp(K(p, 60, 20), 0.2, 3.5) * (o.tau || 1);
        const w = stringWave(o.comb, o.expo, 0.25);
        b.master({ atk: 0.002, rel: clamp(0.2 * K(p, 60, 24), 0.05, 0.45) });
        // prompt sound + after sound: two decay rates, as in a real string trio
        b.part({ wave: w, cents: o.dA, level: 1.0, decay: 0.75 * Kd });
        b.part({ wave: w, cents: o.dB, level: o.bLevel || 0.5, decay: 3.4 * Kd });
        if (o.dC != null) b.part({ wave: w, cents: o.dC, level: 0.4, decay: 1.6 * Kd });
        b.filt({ type: "lowpass", f0: clamp(f * (o.bright * (3.2 + 15 * Math.pow(vel, 1.3))), 900, 16000),
            f1: clamp(f * (2 + 3 * vel), 500, 8000), tau: 0.5 * Kd, q: 0.7 });
        // hammer: a short broadband knock, harder = brighter and louder
        b.noise({ level: (o.hammer || 1) * (0.05 + 0.13 * vel), atk: 0.0005, decay: 0.012,
            filt: { t: "bandpass", f: clamp(f * 5, 1500, 6500), q: 0.8 } });
        if (o.tine) b.part({ wave: "sine", ratio: o.tine, level: 0.05 + 0.1 * vel, decay: 0.35 });
        b.eq({ t: "peaking", f: 2800, q: 0.8, g: o.presence || 1.5 });
    };
}
PATCHES[0] = piano({ comb: 1 / 8, expo: 1.05, dA: -0.8, dB: 1.1, bright: 1 });
PATCHES[1] = piano({ comb: 1 / 9, expo: 0.85, dA: -1.0, dB: 1.3, bright: 1.7, hammer: 1.5, presence: 3.5 });
PATCHES[2] = piano({ comb: 1 / 7, expo: 1.15, dA: -1.5, dB: 1.5, bright: 1.1, tine: 7.02, tau: 0.9, presence: 2.5 });
PATCHES[3] = piano({ comb: 1 / 8, expo: 0.9, dA: -9, dB: 9, dC: 1, bright: 1.5, hammer: 1.3, bLevel: 0.9, presence: 3 });

/* ---- electric pianos (4, 5): FM tines ------------------------------ */
PATCHES[4] = function (b, c) {   // Rhodes-style: sine carrier, 1:1 body FM, bright tine tick
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 22), 0.3, 3);
    b.master({ atk: 0.002, rel: clamp(0.25 * K(p, 60, 30), 0.06, 0.4) });
    b.part({ wave: "sine", level: 1, decay: [[0, 0.45, 0.2 * Kd], [0.4, 0, 1.7 * Kd]],
        fm: [{ ratio: 1, index: 0.5 + 2.3 * vel, decay: [[0, 0.15, 0.35 * Kd]] },
            { ratio: 14, index: 0.25 * vel + 0.05, decay: 0.07 }] });
    b.part({ wave: "sine", ratio: 1, cents: 4, level: 0.18, decay: 2.2 * Kd });
    b.filt({ type: "lowpass", f0: clamp(f * 9, 2500, 12000), f1: clamp(f * 5, 1500, 8000), tau: 0.6, q: 0.7 });
    b.noise({ level: 0.03 + 0.05 * vel, atk: 0.0005, decay: 0.008, filt: { t: "bandpass", f: clamp(f * 6, 2000, 7000), q: 1 } });
    b.lfo({ rate: 5, trem: 0.1 });
};
PATCHES[5] = function (b, c) {   // DX-style: glassy 14:1 attack, 1:1 body, longer ring
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 22), 0.3, 3);
    b.master({ atk: 0.001, rel: clamp(0.3 * K(p, 60, 30), 0.06, 0.45) });
    b.part({ wave: "sine", level: 1, decay: [[0, 0.5, 0.12 * Kd], [0.3, 0, 2.0 * Kd]],
        fm: [{ ratio: 1, index: 0.9 + 1.8 * vel, decay: [[0, 0.1, 0.6 * Kd]] },
            { ratio: 14, index: 0.55 * vel + 0.1, decay: 0.05 }] });
    b.part({ wave: "sine", ratio: 2, level: 0.1 + 0.1 * vel, decay: 0.5 * Kd,
        fm: [{ ratio: 1, index: 0.8, decay: 0.3 }] });
    b.filt({ type: "lowpass", f0: clamp(f * 12, 3000, 15000), f1: clamp(f * 7, 2000, 10000), tau: 0.8, q: 0.7 });
    b.lfo({ rate: 5.5, trem: 0.06 });
};

/* ---- harpsichord, clavinet ----------------------------------------- */
PATCHES[6] = function (b, c) {
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 22), 0.25, 2.5);
    const w = stringWave(0.19, 0.7, 0.3);
    b.master({ atk: 0.001, rel: 0.035 });              // jack + felt damper: abrupt
    b.part({ wave: w, level: 1, decay: [[0, 0.4, 0.15], [0.3, 0, 1.0 * Kd]] });
    b.part({ wave: w, ratio: 2, cents: 3, level: 0.55, decay: [[0, 0.3, 0.12], [0.3, 0, 0.7 * Kd]] });   // 4' register
    b.filt({ type: "lowpass", f0: clamp(f * 16, 2500, 15000), f1: clamp(f * 6, 1200, 8000), tau: 0.5, q: 0.8 });
    b.noise({ level: 0.1 + 0.08 * vel, atk: 0.0004, decay: 0.01, filt: { t: "bandpass", f: clamp(f * 4, 1800, 6000), q: 1.2 } });
    b.eq({ t: "peaking", f: 1300, q: 1.2, g: 4 });
};
PATCHES[7] = function (b, c) {   // Hohner D6: bright, "wacka" filter on the attack
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 20), 0.3, 2.5);
    const w = stringWave(0.15, 0.55, 0.3);
    b.master({ atk: 0.001, rel: 0.04 });
    b.part({ wave: w, level: 1, decay: [[0, 0.5, 0.1], [0.25, 0, 0.9 * Kd]] });
    b.part({ wave: w, cents: 5, level: 0.4, decay: [[0, 0.5, 0.1], [0.25, 0, 0.9 * Kd]] });
    b.filt({ type: "lowpass", f0: clamp(f * (10 + 10 * vel), 3000, 16000), f1: clamp(f * 3.5, 900, 6000), tau: 0.18, q: 3.5 });
    b.noise({ level: 0.1 + 0.12 * vel, atk: 0.0004, decay: 0.012, filt: { t: "bandpass", f: clamp(f * 5, 2000, 7000), q: 1 } });
    b.eq({ t: "peaking", f: 2200, q: 1.4, g: 4 });
};

/* ---- chromatic percussion (8-15): bars, tines, bells -------------- */
function barVoice(o) {
    // o.ratios / o.levels / o.taus (seconds at C4, scaled by register), o.noise
    return function (b, c) {
        const p = c.p, f = c.f, vel = c.vel;
        const Kd = clamp(K(p, 60, o.per || 18), 0.18, 3.2) * (o.tau || 1);
        b.master({ atk: 0.0008, rel: o.rel || 0.18 });
        o.ratios.forEach(function (r, i) {
            if (f * r > 16000) return;
            b.part({ wave: "sine", ratio: r, cents: (o.cents && o.cents[i]) || 0, level: o.levels[i] * (i === 0 ? 1 : (0.5 + 0.5 * vel)),
                decay: o.taus[i] * Kd });
        });
        if (o.filt) b.filt({ type: "lowpass", f0: clamp(f * o.filt[0], 1500, 17000), f1: clamp(f * o.filt[1], 800, 12000), tau: 0.4 * Kd, q: 0.7 });
        if (o.noise) b.noise({ level: o.noise.level * (0.4 + 0.6 * vel), atk: 0.0004, decay: o.noise.decay,
            filt: { t: o.noise.t || "bandpass", f: clamp(f * o.noise.fr, 400, 9000), q: o.noise.q || 1 } });
        if (o.lfo) b.lfo(o.lfo);
    };
}
PATCHES[8] = barVoice({ ratios: [1, 4.0, 9.2], levels: [1, 0.2, 0.05], taus: [1.5, 0.3, 0.1], noise: { level: 0.05, decay: 0.006, fr: 8 } });   // celesta
PATCHES[9] = barVoice({ ratios: [1, 2.76, 5.4, 8.93], levels: [1, 0.5, 0.3, 0.15], taus: [1.4, 0.5, 0.2, 0.08], per: 22,
    noise: { level: 0.08, decay: 0.004, fr: 7, t: "highpass" } });                                                                          // glockenspiel
PATCHES[10] = barVoice({ ratios: [1, 6.27], levels: [1, 0.28], taus: [0.9, 0.18], per: 20, rel: 0.35,
    noise: { level: 0.05, decay: 0.004, fr: 6 } });                                                                                        // music box
PATCHES[11] = barVoice({ ratios: [1, 3.99, 10.1], levels: [1, 0.22, 0.04], taus: [2.6, 0.5, 0.15], rel: 0.3,
    noise: { level: 0.05, decay: 0.01, fr: 4, t: "lowpass", q: 0.7 }, lfo: { rate: 5.2, trem: 0.32 } });                                    // vibraphone (motor on)
PATCHES[12] = barVoice({ ratios: [1, 3.95, 9.8], levels: [1, 0.4, 0.07], taus: [0.55, 0.12, 0.05], per: 16, rel: 0.1,
    noise: { level: 0.1, decay: 0.012, fr: 3, t: "lowpass", q: 0.7 } });                                                                    // marimba
PATCHES[13] = barVoice({ ratios: [1, 3.0, 6.0], levels: [1, 0.5, 0.18], taus: [0.28, 0.1, 0.05], per: 16, rel: 0.06, filt: [20, 8],
    noise: { level: 0.14, decay: 0.005, fr: 8, t: "highpass" } });                                                                          // xylophone
PATCHES[14] = barVoice({ ratios: [1, 2.01, 2.53, 3.43, 5.2], levels: [1, 0.5, 0.4, 0.25, 0.12], taus: [3.2, 1.8, 1.2, 0.7, 0.3], per: 26, rel: 0.5,
    cents: [0, 2, -3, 1, 0], noise: { level: 0.12, decay: 0.008, fr: 3 } });                                                                 // tubular bells
PATCHES[15] = function (b, c) {   // dulcimer: hammered course of three slightly detuned strings
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 20), 0.25, 2.5);
    const w = stringWave(0.2, 0.9, 0.3);
    b.master({ atk: 0.001, rel: 0.2 });
    [-5, 2, 8].forEach(function (cents, i) { b.part({ wave: w, cents: cents, level: 0.7, decay: (1.3 + 0.3 * i) * Kd }); });
    b.filt({ type: "lowpass", f0: clamp(f * (8 + 8 * vel), 2000, 14000), f1: clamp(f * 3, 900, 6000), tau: 0.3 * Kd, q: 0.7 });
    b.noise({ level: 0.08 + 0.08 * vel, atk: 0.0004, decay: 0.01, filt: { t: "bandpass", f: clamp(f * 5, 1800, 7000), q: 1 } });
};

/* ---- organs (16-23) ------------------------------------------------ */
function organ(o) {
    return function (b, c) {
        const p = c.p, f = c.f, vel = c.vel;
        b.master({ atk: o.atk || 0.006, rel: o.rel || 0.05 });
        b.part({ wave: drawbarWave(o.bars), ratio: 0.5, level: 1 });
        if (o.perc) b.part({ wave: "sine", ratio: o.perc.r, level: o.perc.level, decay: o.perc.tau });
        b.noise({ level: o.click || 0.05, atk: 0.0003, decay: 0.006, filt: { t: "bandpass", f: clamp(f * 3, 800, 6000), q: 0.9 } });
        if (o.drive) b.drive({ pre: o.drive, post: 5000 });
        b.filt({ type: "lowpass", f0: 15000, f1: 15000, tau: 1, q: 0.7 });
        b.lfo({ rate: o.leslie, vib: o.vib, trem: o.trem });
    };
}
PATCHES[16] = organ({ bars: [8, 8, 8, 6, 0, 4, 0, 0, 0], leslie: 6.0, vib: 5, trem: 0.1, click: 0.05 });
PATCHES[17] = organ({ bars: [8, 0, 8, 0, 0, 0, 0, 0, 0], perc: { r: 3, level: 0.55, tau: 0.22 }, leslie: 6.7, vib: 6, trem: 0.14, click: 0.08 });
PATCHES[18] = organ({ bars: [8, 8, 8, 8, 5, 6, 3, 4, 5], leslie: 6.9, vib: 8, trem: 0.18, click: 0.07, drive: 3.2 });

PATCHES[19] = function (b, c) {   // pipe organ: principal chorus + 16', slow speech, chiff
    const p = c.p, f = c.f, vel = c.vel;
    b.master({ atk: 0.03, rel: 0.28 });
    const w = addWave("pipe", [[1, 0.5], [2, 1], [3, 0.35], [4, 0.75], [5, 0.2], [6, 0.35], [8, 0.4], [10, 0.18], [12, 0.15], [16, 0.12]], 24);
    b.part({ wave: w, ratio: 0.5, level: 1 });
    b.part({ wave: w, ratio: 0.5, cents: 6, level: 0.5 });
    b.noise({ level: 0.06, atk: 0.004, decay: 0.07, filt: { t: "bandpass", f: clamp(f * 4, 600, 6000), q: 1.2 } });
    b.filt({ type: "lowpass", f0: 14000, f1: 14000, tau: 1, q: 0.7 });
    b.lfo({ rate: 4.2, vib: 3, vibDelay: 0.2, trem: 0.03 });
};
PATCHES[20] = function (b, c) {   // harmonium reed organ
    const f = c.f;
    b.master({ atk: 0.06, rel: 0.09 });
    const w = reedWave(0.85, 1500, 900, 1.2, 0.7);
    b.part({ wave: w, cents: -5, level: 1 });
    b.part({ wave: w, cents: 5, level: 0.8 });
    b.noise({ level: 0.025, atk: 0.04, decay: 100, filt: { t: "bandpass", f: 2500, q: 0.6 } });
    b.filt({ type: "lowpass", f0: clamp(f * 14, 2500, 11000), f1: clamp(f * 14, 2500, 11000), tau: 1, q: 0.7, expr: true });
    b.lfo({ rate: 5, vib: 2, vibDelay: 0.3 });
};
function accordion(o) {
    return function (b, c) {
        const p = c.p, f = c.f;
        b.master({ atk: o.atk, rel: 0.08 });
        const w = reedWave(o.expo, 2000, 1100, o.formant, 0.85);
        b.part({ wave: w, cents: -o.det, level: 1 });
        b.part({ wave: w, cents: o.det, level: 1 });
        if (o.det2) b.part({ wave: w, cents: 0, level: 0.7 });
        b.part({ wave: w, ratio: 2, cents: o.det * 0.5, level: 0.45 });       // 4' reed
        b.noise({ level: 0.03, atk: 0.03, decay: 100, filt: { t: "bandpass", f: 3000, q: 0.6 } });
        b.filt({ type: "lowpass", f0: clamp(f * 16, 3000, 12000), f1: clamp(f * 16, 3000, 12000), tau: 1, q: 0.7, expr: true });
        b.eq({ t: "peaking", f: 1800, q: 1, g: 3 });
        b.lfo({ rate: 5.5, vib: 2, vibDelay: 0.35 });
    };
}
PATCHES[21] = accordion({ atk: 0.045, expo: 0.9, formant: 1.2, det: 13 });                  // musette
PATCHES[23] = accordion({ atk: 0.03, expo: 1.0, formant: 2.2, det: 5, det2: true });        // tango: reedier, tighter tuning
PATCHES[22] = function (b, c) {   // harmonica
    const f = c.f;
    b.master({ atk: 0.05, rel: 0.05 });
    const w = reedWave(1.25, 1800, 900, 1.8, 0.55);
    b.part({ wave: w, cents: -3, level: 1 });
    b.part({ wave: w, cents: 3, level: 0.7 });
    b.noise({ level: 0.05, atk: 0.03, decay: 100, filt: { t: "bandpass", f: 3000, q: 0.7 } });
    b.filt({ type: "lowpass", f0: clamp(f * 12, 2500, 9000), f1: clamp(f * 12, 2500, 9000), tau: 1, q: 0.7, expr: true });
    b.eq({ t: "peaking", f: 1900, q: 1.1, g: 4 });
    b.lfo({ rate: 5.3, vib: 4, vibDelay: 0.4 });
};

/* ---- guitars (24-31) ----------------------------------------------- */
function guitar(o) {
    return function (b, c) {
        const p = c.p, f = c.f, vel = c.vel;
        const Kd = clamp(K(p, 52, 22), 0.25, 3) * (o.tau || 1);
        const w = stringWave(o.pos, o.expo, 0.2);
        b.master({ atk: 0.0015, rel: o.rel || 0.12, lvl: o.lvl });
        b.part({ wave: w, level: 1, decay: o.sus != null ? [[0, o.sus, o.fast * Kd], [0.2, o.sus * 0.3, o.slow * Kd]] : [[0, 0.5, o.fast * Kd], [0.2, 0, o.slow * Kd]] });
        b.part({ wave: w, cents: o.beat, level: 0.35, decay: o.slow * 1.15 * Kd });          // second string polarisation: slow beating
        b.filt({ type: "lowpass", f0: clamp(f * (o.b0 + o.b0v * vel), 1200, 16000), f1: clamp(f * o.b1, 500, 8000), tau: o.ftau * Kd, q: 0.8 });
        b.noise({ level: o.pick * (0.4 + 0.6 * vel), atk: 0.0004, decay: o.pickDecay || 0.01,
            filt: { t: o.pickType || "bandpass", f: clamp(f * 5, 1200, 7000), q: 1 } });
        b.eq({ t: "lowshelf", f: 250, q: 0.7, g: o.body });
        if (o.drive) b.drive({ pre: o.drive * (0.7 + 0.6 * vel), post: o.post });
    };
}
PATCHES[24] = guitar({ pos: 0.17, expo: 1.35, fast: 0.12, slow: 1.6, beat: 0.9, b0: 6, b0v: 8, b1: 2.6, ftau: 0.35, pick: 0.07, pickDecay: 0.008, body: 3.5 });
PATCHES[25] = guitar({ pos: 0.13, expo: 0.95, fast: 0.15, slow: 1.9, beat: 1.1, b0: 9, b0v: 10, b1: 3.6, ftau: 0.4, pick: 0.1, body: 2 });
PATCHES[26] = guitar({ pos: 0.22, expo: 1.7, fast: 0.2, slow: 1.7, beat: 0.6, b0: 4, b0v: 4, b1: 2.8, ftau: 0.5, pick: 0.05, body: 3, rel: 0.15 });
PATCHES[27] = guitar({ pos: 0.12, expo: 1.0, fast: 0.2, slow: 2.4, beat: 0.7, b0: 8, b0v: 10, b1: 4, ftau: 0.6, pick: 0.07, body: 1 });
PATCHES[28] = guitar({ pos: 0.15, expo: 1.2, fast: 0.07, slow: 0.22, beat: 0.5, b0: 4, b0v: 5, b1: 2.2, ftau: 0.1, pick: 0.09, pickDecay: 0.015, pickType: "lowpass", body: 4, rel: 0.03 });
PATCHES[29] = guitar({ pos: 0.13, expo: 0.9, fast: 0.3, slow: 3.5, sus: 0.7, beat: 1.2, b0: 12, b0v: 8, b1: 8, ftau: 0.8, pick: 0.08, body: 1, drive: 3.0, post: 4200, rel: 0.1, lvl: 0.7 });
PATCHES[30] = guitar({ pos: 0.12, expo: 0.8, fast: 0.4, slow: 5, sus: 0.8, beat: 1.4, b0: 14, b0v: 8, b1: 10, ftau: 1, pick: 0.06, body: 0, drive: 9, post: 3300, rel: 0.06, lvl: 0.6 });
PATCHES[31] = function (b, c) {   // natural harmonics: almost pure, bell-like
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 64, 24), 0.3, 2.2);
    b.master({ atk: 0.001, rel: 0.15 });
    b.part({ wave: "sine", level: 1, decay: [[0, 0.6, 0.15], [0.2, 0, 1.4 * Kd]] });
    b.part({ wave: "sine", ratio: 2, level: 0.12 + 0.1 * vel, decay: 0.5 * Kd });
    b.part({ wave: "sine", ratio: 3, level: 0.05 * vel, decay: 0.25 * Kd });
    b.noise({ level: 0.04 + 0.05 * vel, atk: 0.0003, decay: 0.006, filt: { t: "bandpass", f: clamp(f * 4, 1500, 7000), q: 1.2 } });
};

/* ------------------------------------------------------------------ */
/* programs 32-127                                                     */
/* ------------------------------------------------------------------ */

Object.assign(TRIM_DB, {
    // Measured C4 velocity-100 RMS, target 0.019; capped at +/-12 dB.
    32: -3.2, 33: -2.2, 34: -1.1, 35: -2.8, 36: +0.2, 37: +0.7, 38: +0.0, 39: +1.7,
    40: -0.2, 41: -0.9, 42: -0.3, 43: -2.4, 44: +2.6, 45: -3.3, 46: -4.3, 47: -2.8,
    48: +2.8, 49: +3.2, 50: +3.7, 51: +3.4, 52: +2.3, 53: -0.5, 54: +0.2, 55: +6.8,
    56: +1.2, 57: -1.1, 58: -3.0, 59: -1.4, 60: -2.8, 61: +3.5, 62: +2.4, 63: +1.8,
    64: +1.1, 65: +0.1, 66: -0.7, 67: -2.7, 68: +1.3, 69: +1.1, 70: -1.9, 71: -0.9,
    72: -3.2, 73: -3.6, 74: -4.3, 75: -3.4, 76: -3.6, 77: -2.2, 78: -4.2, 79: -4.2,
    80: -2.5, 81: +2.6, 82: -1.2, 83: +0.9, 84: +3.4, 85: +1.8, 86: +2.4, 87: +1.8,
    88: -0.1, 89: +3.8, 90: +3.7, 91: +1.5, 92: +0.0, 93: -0.8, 94: +0.5, 95: -0.6,
    96: +1.0, 97: +2.5, 98: -0.1, 99: +2.5, 100: +3.1, 101: +2.0, 102: +1.7, 103: -8.4,
    104: +2.9, 105: +5.3, 106: +7.6, 107: -0.3, 108: -3.1, 109: +2.8, 110: +0.0, 111: +2.8,
    112: -2.3, 113: -1.2, 114: -1.0, 115: +2.2, 116: -2.1, 117: -1.5, 118: -0.3, 119: +2.6,
    120: +3.2, 121: +1.8, 122: +5.0, 123: +0.5, 124: +0.7, 125: +5.5, 126: +3.0, 127: +1.9,
});

/** resonance-shaped spectrum: n^-expo * (1 + sum of gaussian bumps [Hz, width, boost]); `even` scales even harmonics */
function formantWave(key, expo, formants, even, maxN) {
    const ev = even == null ? 1 : even;
    return {
        key: "fmt" + key, maxN: maxN || 160,
        h: function (n, bp) {
            const f = 440 * Math.pow(2, (bp - 69) / 12) * n;
            let g = 1;
            for (let i = 0; i < formants.length; i++) {
                const F = formants[i];
                g += F[2] * Math.exp(-Math.pow((f - F[0]) / F[1], 2));
            }
            return Math.pow(n, -expo) * g * (n % 2 === 0 ? ev : 1);
        },
    };
}

/** noise-only patches still need one part: it takes over (anchors) the base note's oscillator */
function anchor(b) { b.part({ wave: "sine", level: 0 }); }

const VOWEL = {
    a: [[800, 130, 7], [1150, 160, 4], [2900, 260, 2], [3300, 300, 1]],
    o: [[450, 100, 7], [800, 130, 4], [2830, 260, 1]],
    u: [[325, 90, 7], [700, 130, 2.5], [2530, 260, 0.7]],
};

const W = {
    violin: formantWave("vln", 0.95, [[480, 200, 1.5], [2700, 800, 2.5]]),
    viola: formantWave("vla", 1.0, [[380, 160, 1.5], [1900, 700, 2]]),
    cello: formantWave("vc", 1.05, [[230, 110, 1.8], [1200, 500, 1.5], [2600, 800, 1]]),
    cbass: formantWave("cb", 1.1, [[120, 60, 1.8], [700, 350, 1.4]]),
    choirA: formantWave("chA", 1.5, VOWEL.a, 1, 80),
    choirO: formantWave("chO", 1.6, VOWEL.o, 1, 80),
    ooh: formantWave("ooh", 2.0, VOWEL.u, 1, 60),
    vlead: formantWave("vld", 1.0, VOWEL.a, 1, 80),
    trumpet: formantWave("tpt", 0.75, [[1300, 700, 2.5]]),
    trombone: formantWave("tbn", 0.9, [[550, 350, 2.5], [1400, 500, 1]]),
    tuba: formantWave("tba", 1.3, [[300, 200, 2.5]]),
    horn: formantWave("hrn", 1.5, [[400, 250, 2.5]]),
    mute: formantWave("mute", 0.6, [[1800, 500, 6]]),
    ssx: formantWave("ssx", 0.8, [[1100, 500, 2.5], [2800, 900, 1.5]], 0.9),
    asx: formantWave("asx", 0.85, [[800, 400, 2.5], [2600, 900, 1.5]], 0.9),
    tsx: formantWave("tsx", 0.9, [[600, 300, 2.5], [2200, 800, 1.5]], 0.9),
    bsx: formantWave("bsx", 0.95, [[400, 250, 2.5], [1800, 700, 1.2]], 0.9),
    oboe: formantWave("obo", 0.55, [[1100, 300, 4], [2800, 600, 2]], 0.9),
    ehorn: formantWave("eh", 0.65, [[900, 250, 4], [2400, 600, 1.5]], 0.9),
    bsn: formantWave("bsn", 0.75, [[480, 150, 4], [1150, 300, 2]], 0.9),
    clar: formantWave("cla", 0.9, [[1500, 600, 1.5]], 0.12),              // cylindrical bore: weak even harmonics
    bag: formantWave("bag", 0.5, [[1800, 900, 2.5]], 0.9),
    shanai: formantWave("shn", 0.45, [[1500, 500, 4], [3200, 800, 2]], 0.9),
    flute: addWave("flute", [[1, 1], [2, 0.3], [3, 0.12], [4, 0.06], [5, 0.03], [6, 0.015]]),
    picc: addWave("picc", [[1, 1], [2, 0.15], [3, 0.05]]),
    rec: addWave("rec", [[1, 1], [2, 0.12], [3, 0.18], [4, 0.03], [5, 0.04]]),
    pan: addWave("pan", [[1, 1], [2, 0.1], [3, 0.06]]),
    shaku: addWave("shk", [[1, 1], [2, 0.35], [3, 0.2], [4, 0.1], [5, 0.06]]),
    calliope: addWave("cal", [[1, 1], [2, 0.5], [3, 0.25], [4, 0.12], [5, 0.06]]),
    glass: addWave("gls", [[1, 1], [2, 0.3], [3, 0.15], [5, 0.05]]),
};

/* ---- generic voices ---- */

/** sustained, expression-controlled voice (bowed, blown, sung): n detuned copies + breath/bow noise */
function sustained(o) {
    return function (b, c) {
        const f = c.f, vel = c.vel;
        b.master({ atk: o.atk * (1.3 - 0.6 * vel), rel: o.rel || 0.12, lvl: o.lvl });
        const n = o.n || 1;
        for (let i = 0; i < n; i++) {
            const cents = n === 1 ? 0 : (i / (n - 1) * 2 - 1) * o.det;
            b.part({ wave: o.wave, ratio: o.ratio || 1, cents: cents, level: 1 / Math.sqrt(n), atk: 0.002 + i * (o.stagger || 0) });
        }
        (o.extra || []).forEach(function (x) { b.part(Object.assign({}, x)); });
        const fc = clamp(f * (o.b0 + (o.bv || 0) * vel), o.fmin || 1200, o.fmax || 13000);
        b.filt({ type: "lowpass", f0: fc, f1: fc, tau: 1, q: o.q || 0.7, expr: true });
        if (o.breath) b.noise({ level: o.breath.level * (0.5 + 0.5 * vel), atk: o.atk, decay: 100,
            filt: { t: "bandpass", f: clamp(f * (o.breath.fr || 1), o.breath.min || 300, 9000), q: o.breath.q || 0.8 } });
        if (o.air) b.noise({ level: o.air * (0.5 + 0.5 * vel), atk: o.atk, decay: 100,
            filt: { t: "highpass", f: clamp(f * 2, 1500, 8000), q: 0.7 } });
        if (o.chiff) b.noise({ level: o.chiff.level * (0.4 + 0.6 * vel), atk: 0.002, decay: o.chiff.decay,
            filt: { t: "bandpass", f: clamp(f * (o.chiff.fr || 3), 400, 9000), q: o.chiff.q || 1 } });
        (o.eq || []).forEach(function (e) { b.eq(e); });
        b.lfo({ rate: o.rate || 5.5, vib: o.vib || 0, vibDelay: o.vibDelay != null ? o.vibDelay : 0.3, trem: o.trem || 0 });
    };
}

/** plucked / picked bass string + round sine fundamental */
function bass(o) {
    return function (b, c) {
        const p = c.p, f = c.f, vel = c.vel;
        const Kd = clamp(K(p, 40, 24), 0.4, 2.5) * (o.tau || 1);
        const w = stringWave(o.pos, o.expo, 0.2);
        b.master({ atk: o.atk || 0.002, rel: o.rel || 0.08 });
        b.part({ wave: w, level: 1, decay: [[0, o.sus || 0.45, o.fast * Kd], [0.25, 0, o.slow * Kd]] });
        b.part({ wave: "sine", level: o.sub || 0.3, decay: o.slow * 1.2 * Kd });
        b.filt({ type: "lowpass", f0: clamp(f * (o.b0 + o.b0v * vel), 400, 12000), f1: clamp(f * o.b1, 250, 5000), tau: o.ftau * Kd, q: o.q || 0.8 });
        if (o.pick) b.noise({ level: o.pick * (0.4 + 0.6 * vel), atk: 0.0004, decay: o.pickDecay || 0.01,
            filt: { t: o.pickType || "bandpass", f: clamp(f * (o.pickFr || 6), 600, 5000), q: 1 } });
        if (o.body) b.eq({ t: "peaking", f: o.body[0], q: o.body[1], g: o.body[2] });
        if (o.vib) b.lfo({ rate: 5, vib: o.vib, vibDelay: 0.3 });
    };
}

/** analog-style subtractive synth: osc = [[wave, ratio, cents, level, atk], ...], filter envelope f0 -> f1 */
function synth(o) {
    return function (b, c) {
        const f = c.f, vel = c.vel;
        b.master({ atk: o.atk || 0.003, rel: o.rel || 0.08, decay: o.decay, lvl: o.lvl });
        o.osc.forEach(function (x) {
            b.part({ wave: x[0], ratio: x[1] || 1, cents: x[2] || 0, level: x[3] == null ? 1 : x[3], atk: x[4] });
        });
        b.filt({ type: "lowpass", f0: clamp(f * (o.f0 + (o.f0v || 0) * vel), 150, 16000), f1: clamp(f * o.f1, 120, 16000), tau: o.ftau || 0.3, q: o.q || 0.8 });
        if (o.drive) b.drive({ pre: o.drive, post: o.post || 5000 });
        if (o.noise) b.noise(o.noise);
        if (o.eq) b.eq(o.eq);
        if (o.lfo) b.lfo(o.lfo);
    };
}

/* ---- bass (32-39) -------------------------------------------------- */
PATCHES[32] = bass({ pos: 0.22, expo: 1.5, fast: 0.15, slow: 1.6, b0: 5, b0v: 5, b1: 2.5, ftau: 0.25, sub: 0.45, pick: 0.06, pickType: "lowpass", pickFr: 4, body: [110, 1, 3] });
PATCHES[33] = bass({ pos: 0.2, expo: 1.2, fast: 0.25, slow: 2.6, sus: 0.55, b0: 6, b0v: 8, b1: 3, ftau: 0.4, sub: 0.35, pick: 0.05, pickFr: 5 });
PATCHES[34] = bass({ pos: 0.12, expo: 0.95, fast: 0.2, slow: 2.2, b0: 10, b0v: 12, b1: 4, ftau: 0.3, sub: 0.25, pick: 0.12, pickFr: 8, pickType: "highpass", body: [1200, 1, 3] });
PATCHES[35] = bass({ pos: 0.25, expo: 1.25, fast: 0.35, slow: 3, sus: 0.6, b0: 5, b0v: 5, b1: 3, ftau: 0.6, sub: 0.35, body: [700, 1.5, 3], vib: 6, atk: 0.008 });   // fretless: "mwah" mid bump
PATCHES[36] = bass({ pos: 0.07, expo: 0.85, fast: 0.08, slow: 1.8, sus: 0.35, b0: 28, b0v: 20, b1: 3.5, ftau: 0.07, sub: 0.4, pick: 0.3, pickDecay: 0.006, pickFr: 20, body: [2500, 1.2, 4] });
PATCHES[37] = bass({ pos: 0.05, expo: 0.75, fast: 0.07, slow: 1.6, sus: 0.35, b0: 35, b0v: 20, b1: 5, ftau: 0.06, q: 2, sub: 0.35, pick: 0.35, pickDecay: 0.005, pickFr: 20, body: [3000, 1, 6] });
PATCHES[38] = synth({ osc: [["sawtooth", 1, 0, 1], ["square", 0.5, 0, 0.4]], f0: 6, f0v: 10, f1: 1.6, ftau: 0.15, q: 4, rel: 0.05, decay: [[0, 0.75, 0.4]] });
PATCHES[39] = synth({ osc: [["sawtooth", 1, -7, 0.8], ["sawtooth", 1, 7, 0.8], ["sine", 0.5, 0, 0.6]], f0: 4, f0v: 6, f1: 2, ftau: 0.25, q: 2, drive: 1.5, rel: 0.05 });

/* ---- strings (40-47) ----------------------------------------------- */
PATCHES[40] = sustained({ wave: W.violin, atk: 0.08, rel: 0.18, b0: 10, bv: 8, fmin: 2500, fmax: 12000,
    breath: { level: 0.025, fr: 3, q: 0.7, min: 1500 }, chiff: { level: 0.06, decay: 0.04, fr: 4, q: 0.8 },
    vib: 14, rate: 5.6, vibDelay: 0.2, eq: [{ t: "peaking", f: 2800, q: 1, g: 2 }] });
PATCHES[41] = sustained({ wave: W.viola, atk: 0.09, rel: 0.2, b0: 9, bv: 7, fmin: 2000, fmax: 10000,
    breath: { level: 0.025, fr: 3, q: 0.7, min: 1200 }, chiff: { level: 0.05, decay: 0.045, fr: 4, q: 0.8 },
    vib: 12, rate: 5.3, vibDelay: 0.2 });
PATCHES[42] = sustained({ wave: W.cello, atk: 0.1, rel: 0.22, b0: 9, bv: 6, fmin: 1500, fmax: 8000,
    breath: { level: 0.025, fr: 3, q: 0.7, min: 800 }, chiff: { level: 0.05, decay: 0.05, fr: 4, q: 0.8 },
    vib: 12, rate: 5, vibDelay: 0.25 });
PATCHES[43] = sustained({ wave: W.cbass, atk: 0.12, rel: 0.25, b0: 8, bv: 5, fmin: 800, fmax: 5000,
    breath: { level: 0.02, fr: 3, q: 0.7, min: 500 }, chiff: { level: 0.05, decay: 0.06, fr: 4, q: 0.8 },
    vib: 8, rate: 4.8, vibDelay: 0.3, eq: [{ t: "lowshelf", f: 120, q: 0.7, g: 3 }] });
PATCHES[44] = sustained({ wave: W.violin, n: 3, det: 8, atk: 0.05, rel: 0.2, b0: 9, bv: 6, fmin: 2000, fmax: 10000,
    breath: { level: 0.03, fr: 3, min: 1500 }, rate: 7.5, trem: 0.75 });                                       // tremolo strings
PATCHES[45] = function (b, c) {   // pizzicato
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 24), 0.3, 2.5);
    b.master({ atk: 0.0015, rel: 0.12 });
    b.part({ wave: stringWave(0.3, 1.2, 0.25), level: 1, decay: [[0, 0.35, 0.07 * Kd], [0.12, 0, 0.35 * Kd]] });
    b.part({ wave: W.violin, cents: 3, level: 0.3, decay: 0.25 * Kd });
    b.filt({ type: "lowpass", f0: clamp(f * (6 + 6 * vel), 1500, 10000), f1: clamp(f * 2.5, 700, 5000), tau: 0.12 * Kd, q: 0.8 });
    b.noise({ level: 0.04 + 0.05 * vel, atk: 0.0005, decay: 0.008, filt: { t: "lowpass", f: clamp(f * 4, 800, 5000), q: 0.7 } });
    b.eq({ t: "peaking", f: 450, q: 1, g: 3 });
};
PATCHES[46] = function (b, c) {   // harp: undamped, long ring
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 22), 0.3, 3);
    const w = stringWave(0.4, 1.4, 0.35);
    b.master({ atk: 0.002, rel: 0.8 });
    b.part({ wave: w, level: 1, decay: [[0, 0.55, 0.25 * Kd], [0.3, 0, 2.8 * Kd]] });
    b.part({ wave: w, cents: 1.2, level: 0.3, decay: 3.2 * Kd });
    b.filt({ type: "lowpass", f0: clamp(f * (5 + 6 * vel), 1500, 12000), f1: clamp(f * 2.5, 700, 6000), tau: 0.5 * Kd, q: 0.7 });
    b.noise({ level: 0.03 + 0.04 * vel, atk: 0.0006, decay: 0.01, filt: { t: "bandpass", f: clamp(f * 3, 800, 5000), q: 1 } });
    b.eq({ t: "lowshelf", f: 300, q: 0.7, g: 2 });
};
PATCHES[47] = barVoice({ ratios: [1, 1.5, 1.98, 2.44, 2.95], levels: [1, 0.6, 0.35, 0.2, 0.1], taus: [1.8, 1.0, 0.6, 0.4, 0.25], per: 24, rel: 0.8,
    noise: { level: 0.2, decay: 0.03, fr: 2, t: "lowpass", q: 0.7 } });                                       // timpani: membrane modes

/* ---- ensemble (48-55) ---------------------------------------------- */
PATCHES[48] = sustained({ wave: W.violin, n: 4, det: 9, stagger: 0.025, atk: 0.14, rel: 0.35, b0: 8, bv: 6, fmin: 2000, fmax: 10000,
    breath: { level: 0.015, fr: 3, min: 1500 }, vib: 8, rate: 5.3, vibDelay: 0.15, eq: [{ t: "lowshelf", f: 200, q: 0.7, g: 2 }] });
PATCHES[49] = sustained({ wave: W.violin, n: 4, det: 11, stagger: 0.05, atk: 0.4, rel: 0.5, b0: 6, bv: 4, fmin: 1800, fmax: 8000,
    breath: { level: 0.012, fr: 3, min: 1500 }, vib: 7, rate: 5, vibDelay: 0.3, eq: [{ t: "lowshelf", f: 200, q: 0.7, g: 2 }] });
PATCHES[50] = sustained({ wave: "sawtooth", n: 3, det: 12, atk: 0.12, rel: 0.35, b0: 6, bv: 4, fmin: 1500, fmax: 9000, vib: 4, rate: 5, vibDelay: 0 });
PATCHES[51] = sustained({ wave: "sawtooth", n: 2, det: 15, atk: 0.35, rel: 0.5, b0: 4, bv: 3, fmin: 1000, fmax: 6000,
    extra: [{ wave: "triangle", level: 0.6 }], vib: 3, rate: 4.5, vibDelay: 0 });
PATCHES[52] = sustained({ wave: W.choirA, n: 4, det: 10, stagger: 0.03, atk: 0.18, rel: 0.35, b0: 10, bv: 4, fmin: 2500, fmax: 9000,
    breath: { level: 0.03, fr: 4, q: 0.5, min: 2000 }, vib: 12, rate: 5.2, vibDelay: 0.25 });
PATCHES[53] = sustained({ wave: W.ooh, n: 3, det: 7, stagger: 0.03, atk: 0.12, rel: 0.3, b0: 6, bv: 3, fmin: 1500, fmax: 6000,
    breath: { level: 0.02, fr: 4, q: 0.5, min: 1500 }, vib: 10, rate: 5, vibDelay: 0.25 });
PATCHES[54] = sustained({ wave: W.choirO, n: 2, det: 6, atk: 0.08, rel: 0.3, b0: 7, bv: 3, fmin: 1500, fmax: 7000,
    extra: [{ wave: "sine", level: 0.4 }], vib: 6, rate: 5, vibDelay: 0.2 });
PATCHES[55] = function (b, c) {   // orchestra hit: brass + strings stack with a fifth, fast decay
    const f = c.f, vel = c.vel;
    b.master({ atk: 0.003, rel: 0.25, decay: [[0, 0, 0.35]] });
    b.part({ wave: W.trumpet, level: 1 });
    b.part({ wave: W.violin, cents: 8, level: 0.8 });
    b.part({ wave: W.trumpet, ratio: 2, level: 0.4 });
    b.part({ wave: W.violin, ratio: 0.5, level: 0.5 });
    b.part({ wave: "sawtooth", ratio: 1.4983, level: 0.3 });
    b.filt({ type: "lowpass", f0: clamp(f * (14 + 8 * vel), 3000, 16000), f1: clamp(f * 6, 1500, 8000), tau: 0.15, q: 1 });
    b.noise({ level: 0.25, atk: 0.001, decay: 0.05, filt: { t: "bandpass", f: 1500, q: 0.6 } });
};

/* ---- brass (56-63) ------------------------------------------------- */
// the delayed sawtooth "extra" lets the upper harmonics bloom after the fundamental, as in a real brass attack
PATCHES[56] = sustained({ wave: W.trumpet, atk: 0.035, rel: 0.08, b0: 7, bv: 10, fmin: 1500, fmax: 12000,
    chiff: { level: 0.08, decay: 0.025, fr: 3, q: 0.8 }, breath: { level: 0.012, fr: 4, min: 1500 },
    vib: 9, rate: 5.5, vibDelay: 0.35, extra: [{ wave: "sawtooth", level: 0.25, atk: 0.06 }] });
PATCHES[57] = sustained({ wave: W.trombone, atk: 0.05, rel: 0.1, b0: 5, bv: 8, fmin: 900, fmax: 9000,
    chiff: { level: 0.06, decay: 0.03, fr: 3, q: 0.8 }, vib: 6, rate: 5, vibDelay: 0.4, extra: [{ wave: "sawtooth", level: 0.2, atk: 0.08 }] });
PATCHES[58] = sustained({ wave: W.tuba, atk: 0.06, rel: 0.12, b0: 3.5, bv: 5, fmin: 500, fmax: 5000,
    chiff: { level: 0.05, decay: 0.04, fr: 2, q: 0.8 }, vib: 4, rate: 4.8, vibDelay: 0.4 });
PATCHES[59] = sustained({ wave: W.mute, atk: 0.03, rel: 0.07, b0: 10, bv: 6, fmin: 2000, fmax: 10000,
    chiff: { level: 0.05, decay: 0.02, fr: 4 }, vib: 8, rate: 5.5, vibDelay: 0.3,
    eq: [{ t: "highpass", f: 450, q: 0.7 }, { t: "peaking", f: 1700, q: 2, g: 6 }] });
PATCHES[60] = sustained({ wave: W.horn, atk: 0.07, rel: 0.15, b0: 4, bv: 5, fmin: 800, fmax: 6000,
    chiff: { level: 0.04, decay: 0.04, fr: 2 }, vib: 5, rate: 5, vibDelay: 0.4 });
PATCHES[61] = sustained({ wave: W.trumpet, n: 3, det: 8, stagger: 0.015, atk: 0.04, rel: 0.12, b0: 6, bv: 9, fmin: 1500, fmax: 11000,
    chiff: { level: 0.06, decay: 0.03, fr: 3 }, vib: 5, rate: 5.3, vibDelay: 0.35, extra: [{ wave: "sawtooth", level: 0.2, atk: 0.07 }] });
PATCHES[62] = synth({ osc: [["sawtooth", 1, -6, 1], ["sawtooth", 1, 6, 1]], atk: 0.02, rel: 0.15, f0: 14, f0v: 10, f1: 4, ftau: 0.25, q: 2,
    decay: [[0, 0.85, 0.3]], lfo: { rate: 5, vib: 4, vibDelay: 0.3 } });
PATCHES[63] = synth({ osc: [["sawtooth", 1, -4, 1], ["square", 1, 5, 0.6]], atk: 0.06, rel: 0.2, f0: 8, f0v: 6, f1: 3, ftau: 0.4, q: 1.5,
    decay: [[0, 0.85, 0.4]], lfo: { rate: 5, vib: 4, vibDelay: 0.3 } });

/* ---- reed (64-71) -------------------------------------------------- */
PATCHES[64] = sustained({ wave: W.ssx, atk: 0.03, rel: 0.08, b0: 9, bv: 8, fmin: 2000, breath: { level: 0.03, fr: 3, q: 0.7, min: 1500 },
    chiff: { level: 0.05, decay: 0.02, fr: 3 }, vib: 12, rate: 5.2, vibDelay: 0.3 });
PATCHES[65] = sustained({ wave: W.asx, atk: 0.03, rel: 0.08, b0: 8, bv: 8, fmin: 1800, breath: { level: 0.035, fr: 3, q: 0.7, min: 1500 },
    chiff: { level: 0.05, decay: 0.02, fr: 3 }, vib: 14, rate: 5, vibDelay: 0.3 });
PATCHES[66] = sustained({ wave: W.tsx, atk: 0.035, rel: 0.09, b0: 7, bv: 8, fmin: 1500, breath: { level: 0.04, fr: 3, q: 0.7, min: 1200 },
    chiff: { level: 0.05, decay: 0.025, fr: 3 }, vib: 14, rate: 4.8, vibDelay: 0.3 });
PATCHES[67] = sustained({ wave: W.bsx, atk: 0.04, rel: 0.1, b0: 6, bv: 7, fmin: 1000, fmax: 8000, breath: { level: 0.035, fr: 3, q: 0.7, min: 900 },
    chiff: { level: 0.05, decay: 0.03, fr: 3 }, vib: 10, rate: 4.6, vibDelay: 0.35 });
PATCHES[68] = sustained({ wave: W.oboe, atk: 0.035, rel: 0.07, b0: 10, bv: 5, fmin: 2500, breath: { level: 0.012, fr: 3, min: 1500 },
    vib: 10, rate: 5.5, vibDelay: 0.3, eq: [{ t: "peaking", f: 1200, q: 1.5, g: 3 }] });
PATCHES[69] = sustained({ wave: W.ehorn, atk: 0.04, rel: 0.08, b0: 8, bv: 5, fmin: 2000, breath: { level: 0.012, fr: 3, min: 1200 },
    vib: 9, rate: 5.2, vibDelay: 0.3 });
PATCHES[70] = sustained({ wave: W.bsn, atk: 0.04, rel: 0.09, b0: 7, bv: 5, fmin: 1200, fmax: 6000, breath: { level: 0.012, fr: 3, min: 800 },
    vib: 7, rate: 5, vibDelay: 0.35 });
PATCHES[71] = sustained({ wave: W.clar, atk: 0.03, rel: 0.07, b0: 7, bv: 8, fmin: 1500, breath: { level: 0.015, fr: 3, min: 1200 },
    vib: 3, rate: 5, vibDelay: 0.5 });

/* ---- pipe (72-79) -------------------------------------------------- */
// breath = noise tuned to the pitch (edge tone), air = broadband hiss, chiff = onset transient
PATCHES[72] = sustained({ wave: W.picc, atk: 0.04, rel: 0.08, b0: 8, fmin: 3000, breath: { level: 0.05, fr: 1, q: 6, min: 500 }, air: 0.015,
    chiff: { level: 0.06, decay: 0.03, fr: 2, q: 1 }, vib: 10, rate: 5.6, vibDelay: 0.2 });
PATCHES[73] = sustained({ wave: W.flute, atk: 0.05, rel: 0.1, b0: 7, fmin: 2500, breath: { level: 0.05, fr: 1, q: 5, min: 250 }, air: 0.02,
    chiff: { level: 0.05, decay: 0.03, fr: 2 }, vib: 12, rate: 5.2, vibDelay: 0.25 });
PATCHES[74] = sustained({ wave: W.rec, atk: 0.025, rel: 0.07, b0: 8, fmin: 2500, breath: { level: 0.03, fr: 1, q: 6, min: 250 }, air: 0.01,
    chiff: { level: 0.09, decay: 0.025, fr: 4 }, vib: 3, rate: 5, vibDelay: 0.4 });
PATCHES[75] = sustained({ wave: W.pan, atk: 0.04, rel: 0.1, b0: 5, fmin: 2000, breath: { level: 0.09, fr: 1, q: 4, min: 250 }, air: 0.05,
    chiff: { level: 0.14, decay: 0.05, fr: 1.5 }, vib: 6, rate: 5, vibDelay: 0.3 });
PATCHES[76] = sustained({ wave: "sine", atk: 0.08, rel: 0.12, b0: 5, fmin: 1500, breath: { level: 0.14, fr: 1, q: 10, min: 150 }, air: 0.06,
    chiff: { level: 0.05, decay: 0.06, fr: 1 }, vib: 3, rate: 4.5, extra: [{ wave: "sine", ratio: 2, level: 0.05 }] });
PATCHES[77] = sustained({ wave: W.shaku, atk: 0.07, rel: 0.12, b0: 6, fmin: 2000, breath: { level: 0.1, fr: 1, q: 3, min: 250 }, air: 0.06,
    chiff: { level: 0.12, decay: 0.08, fr: 2 }, vib: 18, rate: 4.5, vibDelay: 0.4 });
PATCHES[78] = sustained({ wave: "sine", atk: 0.03, rel: 0.06, b0: 4, fmin: 2000, breath: { level: 0.02, fr: 1, q: 12, min: 300 }, air: 0.01,
    vib: 18, rate: 6, vibDelay: 0.15, extra: [{ wave: "sine", ratio: 2, level: 0.03 }] });
PATCHES[79] = sustained({ wave: "sine", atk: 0.03, rel: 0.08, b0: 4, fmin: 1500, breath: { level: 0.03, fr: 1, q: 8, min: 250 }, air: 0.012,
    chiff: { level: 0.04, decay: 0.03, fr: 2 }, vib: 6, rate: 5, extra: [{ wave: "sine", ratio: 3, level: 0.04 }] });

/* ---- synth lead (80-87) -------------------------------------------- */
PATCHES[80] = synth({ osc: [["square", 1, 0, 1], ["square", 1, 8, 0.6]], atk: 0.004, rel: 0.06, f0: 10, f0v: 10, f1: 6, ftau: 0.3, q: 1.5,
    lfo: { rate: 5.5, vib: 8, vibDelay: 0.35 } });
PATCHES[81] = synth({ osc: [["sawtooth", 1, -5, 1], ["sawtooth", 1, 5, 1]], atk: 0.004, rel: 0.06, f0: 14, f0v: 10, f1: 8, ftau: 0.3, q: 2,
    lfo: { rate: 5.5, vib: 8, vibDelay: 0.35 } });
PATCHES[82] = sustained({ wave: W.calliope, atk: 0.02, rel: 0.06, b0: 8, fmin: 2500, breath: { level: 0.06, fr: 1, q: 4, min: 250 }, air: 0.04,
    chiff: { level: 0.06, decay: 0.03, fr: 2 }, vib: 12, rate: 6.5, vibDelay: 0 });
PATCHES[83] = synth({ osc: [["triangle", 1, 0, 1], ["square", 2, 0, 0.25]], atk: 0.003, rel: 0.08, f0: 16, f1: 6, ftau: 0.08, q: 1,
    noise: { level: 0.12, atk: 0.001, decay: 0.03, filt: { t: "bandpass", f: 3000, q: 1 } }, lfo: { rate: 5.5, vib: 6, vibDelay: 0.3 } });
PATCHES[84] = synth({ osc: [["sawtooth", 1, -4, 1], ["sawtooth", 1, 4, 0.8], ["square", 0.5, 0, 0.3]], atk: 0.003, rel: 0.08,
    f0: 10, f0v: 8, f1: 5, ftau: 0.5, q: 1, drive: 6, post: 4500, lvl: 0.7, lfo: { rate: 5.5, vib: 6, vibDelay: 0.3 } });
PATCHES[85] = sustained({ wave: W.vlead, n: 2, det: 6, atk: 0.02, rel: 0.15, b0: 10, fmin: 2500, extra: [{ wave: "sawtooth", level: 0.3 }],
    vib: 10, rate: 5.5, vibDelay: 0.25 });
PATCHES[86] = synth({ osc: [["sawtooth", 1, 0, 1], ["sawtooth", 1.4983, 0, 0.7]], atk: 0.004, rel: 0.08, f0: 10, f0v: 8, f1: 6, ftau: 0.3, q: 1.5,
    lfo: { rate: 5.5, vib: 5, vibDelay: 0.35 } });
PATCHES[87] = synth({ osc: [["sawtooth", 1, 0, 1], ["square", 0.5, 0, 0.7], ["sawtooth", 1, 9, 0.5]], atk: 0.003, rel: 0.08,
    f0: 8, f0v: 10, f1: 3, ftau: 0.25, q: 3, decay: [[0, 0.8, 0.5]], lfo: { rate: 5.5, vib: 5, vibDelay: 0.35 } });

/* ---- synth pad (88-95) --------------------------------------------- */
PATCHES[88] = function (b, c) {   // new age: FM bell attack over a soft saw pad
    const f = c.f, vel = c.vel;
    b.master({ atk: 0.01, rel: 1.0 });
    b.part({ wave: "sine", level: 0.8, decay: [[0, 0.3, 0.8]], fm: [{ ratio: 3.5, index: 0.3 + 1.2 * vel, decay: 0.6 }] });
    b.part({ wave: "sawtooth", cents: -6, level: 0.4, atk: 0.8 });
    b.part({ wave: "sawtooth", cents: 6, level: 0.4, atk: 0.8 });
    b.filt({ type: "lowpass", f0: clamp(f * 8, 1500, 9000), f1: clamp(f * 4, 900, 6000), tau: 1.2, q: 0.8 });
    b.lfo({ rate: 5, vib: 3, vibDelay: 0.5 });
};
PATCHES[89] = synth({ osc: [["sawtooth", 1, -8, 1], ["sawtooth", 1, 8, 1], ["triangle", 0.5, 0, 0.5]], atk: 0.45, rel: 0.9,
    f0: 3, f0v: 2, f1: 3, ftau: 1, q: 0.7, lfo: { rate: 4.5, vib: 3, vibDelay: 0 } });
PATCHES[90] = synth({ osc: [["sawtooth", 1, -10, 1], ["sawtooth", 1, 10, 1]], atk: 0.01, rel: 0.4, decay: [[0, 0.6, 0.6]],
    f0: 12, f0v: 10, f1: 3.5, ftau: 0.5, q: 2, lfo: { rate: 5, vib: 3, vibDelay: 0 } });
PATCHES[91] = sustained({ wave: W.choirO, n: 4, det: 14, stagger: 0.06, atk: 0.5, rel: 1, b0: 6, fmin: 1500, fmax: 7000, air: 0.02,
    extra: [{ wave: "sine", level: 0.3, atk: 0.4 }], vib: 5, rate: 4.5, vibDelay: 0 });
PATCHES[92] = sustained({ wave: W.glass, n: 2, det: 4, atk: 0.6, rel: 0.8, b0: 12, fmin: 3000, air: 0.012, vib: 3, rate: 4, trem: 0.12, vibDelay: 0 });
PATCHES[93] = function (b, c) {   // metallic: inharmonic FM (sqrt 2) + saw bed
    const f = c.f, vel = c.vel;
    b.master({ atk: 0.02, rel: 0.8 });
    b.part({ wave: "sine", level: 1, decay: [[0, 0.4, 1.5]], fm: [{ ratio: 1.414, index: 1 + 1.5 * vel, decay: [[0, 0.3, 1.2]] }] });
    b.part({ wave: "sawtooth", cents: 5, level: 0.3, atk: 0.4 });
    b.filt({ type: "lowpass", f0: clamp(f * 10, 2000, 14000), f1: clamp(f * 4, 1000, 8000), tau: 1.5, q: 2 });
    b.lfo({ rate: 4, vib: 4, trem: 0.1 });
};
PATCHES[94] = sustained({ wave: W.ooh, n: 3, det: 12, stagger: 0.05, atk: 0.4, rel: 1.2, b0: 8, fmin: 2000, fmax: 8000, air: 0.015,
    extra: [{ wave: "triangle", ratio: 2, level: 0.3, atk: 0.5 }], vib: 5, rate: 4.5, vibDelay: 0 });
PATCHES[95] = synth({ osc: [["sawtooth", 1, -9, 1], ["sawtooth", 1, 9, 1]], atk: 0.3, rel: 1, f0: 0.8, f1: 14, ftau: 1.6, q: 6,
    lfo: { rate: 4, vib: 3, vibDelay: 0 } });

/* ---- synth effects (96-103) ---------------------------------------- */
PATCHES[96] = function (b, c) {   // rain: bell plinks, pad, high droplet hiss
    const f = c.f, vel = c.vel;
    b.master({ atk: 0.003, rel: 0.6 });
    b.part({ wave: "sine", level: 1, decay: 0.6, fm: [{ ratio: 3.5, index: 0.4 + 0.8 * vel, decay: 0.3 }] });
    b.part({ wave: "triangle", level: 0.35, atk: 0.3 });
    b.noise({ level: 0.03, atk: 0.2, decay: 100, filt: { t: "highpass", f: 6000, q: 0.7 } });
    b.filt({ type: "lowpass", f0: clamp(f * 12, 3000, 14000), f1: clamp(f * 12, 3000, 14000), tau: 1, q: 0.7 });
    b.lfo({ rate: 9, trem: 0.4 });
};
PATCHES[97] = synth({ osc: [["sawtooth", 1, -7, 1], ["sawtooth", 1, 7, 1], ["sine", 0.5, 0, 0.5]], atk: 0.6, rel: 1.5,
    f0: 10, f0v: 4, f1: 2.5, ftau: 2.5, q: 3, lfo: { rate: 3.5, vib: 4, vibDelay: 0 } });
PATCHES[98] = function (b, c) {   // crystal: inharmonic bell partials over a quiet sine pad
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 22), 0.3, 2.5);
    b.master({ atk: 0.002, rel: 1 });
    [[1, 1, 2.0], [2.76, 0.5, 0.9], [5.4, 0.3, 0.4], [8.93, 0.15, 0.2]].forEach(function (x, i) {
        if (f * x[0] < 16000) b.part({ wave: "sine", ratio: x[0], level: x[1] * (i === 0 ? 1 : 0.5 + 0.5 * vel), decay: x[2] * Kd });
    });
    b.part({ wave: "sine", cents: -5, level: 0.3, atk: 0.3 });
    b.part({ wave: "sine", cents: 5, level: 0.3, atk: 0.3 });
    b.lfo({ rate: 5, vib: 3, trem: 0.15 });
};
PATCHES[99] = function (b, c) {   // atmosphere: plucked string + pad
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 22), 0.3, 2.5);
    b.master({ atk: 0.002, rel: 1 });
    b.part({ wave: stringWave(0.15, 1.1, 0.2), level: 1, decay: [[0, 0.4, 0.3 * Kd], [0.3, 0, 2.5 * Kd]] });
    b.part({ wave: "sawtooth", cents: -6, level: 0.35, atk: 0.5 });
    b.part({ wave: "sawtooth", cents: 6, level: 0.35, atk: 0.5 });
    b.filt({ type: "lowpass", f0: clamp(f * (8 + 6 * vel), 2000, 14000), f1: clamp(f * 3, 800, 6000), tau: 0.6, q: 1 });
    b.lfo({ rate: 4.5, vib: 4, vibDelay: 0.3 });
};
PATCHES[100] = synth({ osc: [["sawtooth", 1, -10, 0.7], ["sawtooth", 1, 10, 0.7], ["square", 2, 0, 0.3]], atk: 0.15, rel: 1,
    f0: 18, f0v: 8, f1: 10, ftau: 1, q: 2, lfo: { rate: 5, vib: 4, trem: 0.1 } });
PATCHES[101] = synth({ osc: [["sawtooth", 1, 0, 1], ["square", 0.5, 13, 0.5]], atk: 0.8, rel: 1.2, f0: 2, f0v: 1, f1: 9, ftau: 2, q: 8,
    lfo: { rate: 1.5, vib: 30, trem: 0.4 } });
PATCHES[102] = function (b, c) {   // echoes: pluck + pad, the pick transient repeats like a delay line
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 60, 24), 0.4, 2.5);
    b.master({ atk: 0.003, rel: 1.2 });
    b.part({ wave: stringWave(0.15, 1.1, 0.2), level: 1, decay: [[0, 0.45, 0.3 * Kd], [0.3, 0, 2.5 * Kd]] });
    b.part({ wave: "sawtooth", cents: 7, level: 0.25, atk: 0.6 });
    b.filt({ type: "lowpass", f0: clamp(f * (6 + 6 * vel), 1500, 12000), f1: clamp(f * 3, 800, 6000), tau: 0.8, q: 1 });
    [0, 0.3, 0.6, 0.9].forEach(function (d, i) {
        b.noise({ delay: d, level: (0.08 + 0.06 * vel) * Math.pow(0.55, i), atk: 0.001, decay: 0.012,
            filt: { t: "bandpass", f: clamp(f * 4, 1000, 6000), q: 2 } });
    });
    b.lfo({ rate: 3.33, trem: 0.45, vib: 3 });
};
PATCHES[103] = function (b, c) {   // sci-fi: wide slow vibrato, resonant upward sweep
    const f = c.f, vel = c.vel;
    b.master({ atk: 0.05, rel: 1 });
    b.part({ wave: "sine", level: 1, fm: [{ ratio: 2.5, index: 1 + 2 * vel, decay: [[0, 0.3, 1.5]] }] });
    b.part({ wave: "triangle", ratio: 0.5, level: 0.4, atk: 0.5 });
    b.filt({ type: "lowpass", f0: clamp(f * 2, 300, 8000), f1: clamp(f * 10, 1500, 14000), tau: 2, q: 6 });
    b.lfo({ rate: 0.8, vib: 40 });
};

/* ---- ethnic (104-111) ---------------------------------------------- */
PATCHES[104] = function (b, c) {   // sitar: jawari buzz = brightness rising after the pluck, sympathetic shimmer
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 55, 22), 0.3, 2.5);
    const w = stringWave(0.08, 0.6, 0.3);
    b.master({ atk: 0.001, rel: 0.25 });
    b.part({ wave: w, level: 1, decay: [[0, 0.5, 0.4 * Kd], [0.4, 0, 3 * Kd]] });
    b.part({ wave: w, cents: 12, level: 0.15, atk: 0.15, decay: 3.5 * Kd });
    b.filt({ type: "lowpass", f0: clamp(f * 3, 600, 8000), f1: clamp(f * (14 + 6 * vel), 2500, 14000), tau: 0.25, q: 5 });
    b.noise({ level: 0.08 + 0.08 * vel, atk: 0.0004, decay: 0.01, filt: { t: "bandpass", f: clamp(f * 6, 2000, 7000), q: 1 } });
    b.eq({ t: "peaking", f: 3000, q: 2, g: 5 });
    b.drive({ pre: 1.5, post: 9000 });
};
PATCHES[105] = guitar({ pos: 0.1, expo: 0.85, fast: 0.08, slow: 0.9, beat: 1.5, b0: 14, b0v: 8, b1: 5, ftau: 0.25, pick: 0.12, pickDecay: 0.008, body: -2 });
PATCHES[106] = guitar({ pos: 0.09, expo: 0.8, fast: 0.06, slow: 0.6, beat: 2, b0: 16, b0v: 6, b1: 5, ftau: 0.15, pick: 0.2, pickDecay: 0.012, pickType: "highpass", body: -3, rel: 0.08 });
PATCHES[107] = guitar({ pos: 0.14, expo: 1.05, fast: 0.2, slow: 1.8, beat: 1.2, b0: 9, b0v: 8, b1: 3.5, ftau: 0.4, pick: 0.08, body: 1, rel: 0.2 });
PATCHES[108] = barVoice({ ratios: [1, 5.95, 16.8], levels: [1, 0.25, 0.06], taus: [1.1, 0.15, 0.05], per: 20, rel: 0.25,
    noise: { level: 0.06, decay: 0.005, fr: 5, t: "lowpass", q: 0.7 } });                                     // kalimba
PATCHES[109] = sustained({ wave: W.bag, atk: 0.02, rel: 0.05, b0: 14, fmin: 3000, air: 0.008,
    extra: [{ wave: W.bag, ratio: 0.5, cents: 3, level: 0.35 }], eq: [{ t: "peaking", f: 2000, q: 1, g: 4 }] });
PATCHES[110] = sustained({ wave: W.violin, atk: 0.04, rel: 0.12, b0: 13, bv: 8, fmin: 3000, breath: { level: 0.04, fr: 3, min: 1500 },
    chiff: { level: 0.1, decay: 0.05, fr: 4 }, vib: 8, rate: 6, vibDelay: 0.15, eq: [{ t: "peaking", f: 2500, q: 1.2, g: 3 }] });
PATCHES[111] = sustained({ wave: W.shanai, atk: 0.025, rel: 0.06, b0: 14, fmin: 3000, breath: { level: 0.02, fr: 3, min: 2000 },
    vib: 16, rate: 6, vibDelay: 0.2, eq: [{ t: "peaking", f: 1500, q: 1.5, g: 4 }] });

/* ---- percussive (112-119) ------------------------------------------ */
PATCHES[112] = barVoice({ ratios: [1, 2.76, 5.4, 8.93, 13.3], levels: [1, 0.6, 0.4, 0.25, 0.1], taus: [1.2, 0.6, 0.3, 0.15, 0.08], per: 24, rel: 0.4,
    cents: [0, 6, -4, 3, 0], noise: { level: 0.05, decay: 0.003, fr: 8, t: "highpass" } });                  // tinkle bell
PATCHES[113] = barVoice({ ratios: [1, 2.38, 4.2], levels: [1, 0.35, 0.12], taus: [0.45, 0.15, 0.06], per: 20, rel: 0.15,
    noise: { level: 0.12, decay: 0.004, fr: 5 } });                                                          // agogo
PATCHES[114] = barVoice({ ratios: [1, 2, 3, 3.99, 5.1], levels: [1, 0.6, 0.25, 0.15, 0.05], taus: [0.9, 0.6, 0.3, 0.2, 0.1], per: 22, rel: 0.25,
    cents: [0, 8, -6, 10, 0], filt: [14, 5], noise: { level: 0.06, decay: 0.006, fr: 3, t: "lowpass", q: 0.7 } });   // steel drum
PATCHES[115] = barVoice({ ratios: [1, 2.57, 4.1], levels: [1, 0.3, 0.12], taus: [0.07, 0.03, 0.015], per: 30, rel: 0.03,
    noise: { level: 0.25, decay: 0.004, fr: 4, q: 2 } });                                                    // woodblock
PATCHES[116] = function (b, c) {   // taiko: deep membrane + skin slap
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 40, 24), 0.4, 2.5);
    b.master({ atk: 0.001, rel: 0.6 });
    [[1, 1, 0.5], [1.59, 0.5, 0.25], [2.14, 0.3, 0.15], [2.3, 0.2, 0.1]].forEach(function (x) {
        b.part({ wave: "sine", ratio: x[0], level: x[1], decay: x[2] * Kd });
    });
    b.noise({ level: 0.25 + 0.25 * vel, atk: 0.001, decay: 0.06, filt: { t: "lowpass", f: clamp(f * 3, 400, 2000), q: 0.7 } });
    b.noise({ level: 0.05 + 0.08 * vel, atk: 0.0005, decay: 0.01, filt: { t: "highpass", f: 3000, q: 0.7 } });
};
PATCHES[117] = barVoice({ ratios: [1, 1.5, 1.98, 2.44], levels: [1, 0.5, 0.3, 0.15], taus: [0.35, 0.15, 0.08, 0.05], per: 24, rel: 0.2,
    noise: { level: 0.25, decay: 0.02, fr: 2, t: "lowpass", q: 0.7 } });                                     // melodic tom
PATCHES[118] = function (b, c) {   // synth drum
    const p = c.p, f = c.f, vel = c.vel;
    const Kd = clamp(K(p, 48, 24), 0.4, 2.5);
    b.master({ atk: 0.001, rel: 0.15 });
    b.part({ wave: "sine", level: 1, decay: 0.25 * Kd, fm: [{ ratio: 1, index: 1.5 * vel, decay: 0.03 }] });
    b.noise({ level: 0.15, atk: 0.0005, decay: 0.04, filt: { t: "bandpass", f: clamp(f * 8, 1000, 6000), q: 0.8 } });
};
PATCHES[119] = function (b) {      // reverse cymbal: noise swell
    b.master({ atk: 0.005, rel: 0.05 });
    anchor(b);
    b.noise({ level: 0.5, atk: 1.8, decay: 100, filt: { t: "highpass", f: 5000, q: 0.7 } });
    b.noise({ level: 0.3, atk: 2.0, decay: 100, filt: { t: "bandpass", f: 9000, q: 0.8 } });
};

/* ---- sound effects (120-127) --------------------------------------- */
PATCHES[120] = function (b, c) {   // guitar fret noise: finger squeak
    const f = c.f;
    b.master({ atk: 0.001, rel: 0.05 });
    b.part({ wave: "sine", ratio: 3, level: 0.15, decay: 0.08 });
    b.noise({ level: 0.4, atk: 0.03, decay: 0.06, filt: { t: "bandpass", f: clamp(f * 4, 1500, 6000), q: 4 } });
    b.noise({ level: 0.1, atk: 0.02, decay: 0.04, filt: { t: "highpass", f: 4000, q: 0.7 } });
};
PATCHES[121] = function (b, c) {   // breath noise
    const f = c.f;
    b.master({ atk: 0.08, rel: 0.15 });
    anchor(b);
    b.noise({ level: 0.4, atk: 0.08, decay: [[0, 0.6, 0.4]], filt: { t: "bandpass", f: clamp(f * 2, 500, 4000), q: 0.8 } });
    b.noise({ level: 0.12, atk: 0.08, decay: 100, filt: { t: "highpass", f: 3000, q: 0.7 } });
};
PATCHES[122] = function (b, c) {   // seashore: slow surf swell
    const f = c.f;
    b.master({ atk: 0.8, rel: 1.5 });
    anchor(b);
    b.noise({ level: 0.5, atk: 1.0, decay: 100, filt: { t: "lowpass", f: clamp(f * 3, 400, 4000), q: 0.7 } });
    b.noise({ level: 0.15, atk: 1.5, decay: 100, filt: { t: "highpass", f: 4000, q: 0.7 } });
    b.lfo({ rate: 0.15, trem: 0.85 });
};
PATCHES[123] = function (b) {      // bird tweet: fast wide chirp vibrato
    b.master({ atk: 0.005, rel: 0.08 });
    b.part({ wave: "sine", ratio: 4, level: 1 });
    b.part({ wave: "sine", ratio: 8, level: 0.1 });
    b.lfo({ rate: 14, vib: 250, trem: 0.9 });
};
PATCHES[124] = function (b, c) {   // telephone ring: two tones, clapper tremolo
    const f = c.f;
    b.master({ atk: 0.002, rel: 0.03 });
    b.part({ wave: "square", ratio: 2, level: 0.6 });
    b.part({ wave: "square", ratio: 2.4, level: 0.5 });
    b.filt({ type: "lowpass", f0: clamp(f * 16, 3000, 12000), f1: clamp(f * 16, 3000, 12000), tau: 1, q: 0.7 });
    b.lfo({ rate: 16, trem: 1.0 });
};
PATCHES[125] = function (b, c) {   // helicopter: rotor-chopped rumble
    const f = c.f;
    b.master({ atk: 0.5, rel: 0.6 });
    b.part({ wave: "sawtooth", ratio: 0.5, level: 0.2 });
    b.noise({ level: 0.8, atk: 0.5, decay: 100, filt: { t: "lowpass", f: clamp(f * 2, 200, 2000), q: 1 } });
    b.lfo({ rate: 11, trem: 0.95 });
};
PATCHES[126] = function (b) {      // applause
    b.master({ atk: 0.3, rel: 0.8 });
    anchor(b);
    b.noise({ level: 0.5, atk: 0.3, decay: 100, filt: { t: "bandpass", f: 2500, q: 0.6 } });
    b.noise({ level: 0.3, atk: 0.3, decay: 100, filt: { t: "bandpass", f: 1200, q: 1 } });
    b.lfo({ rate: 13, trem: 0.45 });
};
PATCHES[127] = function (b) {      // gunshot: crack + boom
    b.master({ atk: 0.0005, rel: 0.4 });
    b.part({ wave: "sine", ratio: 0.5, level: 0.6, decay: 0.1 });
    b.noise({ level: 1.2, atk: 0.0005, decay: [[0, 0.25, 0.015], [0.02, 0, 0.25]], filt: { t: "lowpass", f: 3000, q: 0.7 } });
    b.noise({ level: 0.6, atk: 0.0005, decay: 0.12, filt: { t: "bandpass", f: 200, q: 0.8 } });
};

/* ------------------------------------------------------------------ */
/* engine                                                              */
/* ------------------------------------------------------------------ */

/** true if this GM program has a hand-programmed patch (otherwise create-note keeps the wavetable) */
export function hasSynthInstrument(program) {
    return typeof program === "number" && PATCHES[program] !== undefined;
}

/**
 * Renders one note with a hand-programmed instrument. `this` = the player.
 * @returns {null | function} null when silent, otherwise the stop function.
 */
export default function createSynthInstrumentNote(option) {
    const ctx = this.context;
    const player = this;
    // pitch bend and modulation are applied here (to every oscillator), not by the base note
    const baseOption = Object.assign({}, option);
    delete baseOption.pitchBend;
    delete baseOption.modulation;
    const note = this.createBaseNote(baseOption, false, true, false, true, true);
    if (note.isGainValueZero) return null;

    const program = option.instrument;
    const t0 = note.start;
    const tStop = Math.max(note.stop, t0 + 0.02);
    const songStart = this.states.startTime, latency = this.baseLatency;
    const vel = clamp(Number(option.velocity) || 0, 0, 1);
    const nyq = ctx.sampleRate * 0.45;
    const c = { p: option.pitch, f: note.pitch, vel: vel, len: tStop - t0 };

    /* ---- collect the patch description ---- */
    const spec = { master: { atk: 0.003, rel: 0.1 }, filt: null, eq: [], lfo: null, drive: null, parts: [], noises: [] };
    const b = {
        master: function (o) { spec.master = Object.assign(spec.master, o); },
        filt: function (o) { spec.filt = o; },
        eq: function (o) { spec.eq.push(o); },
        lfo: function (o) { spec.lfo = o; },
        drive: function (o) { spec.drive = o; },
        part: function (o) { spec.parts.push(o); },
        noise: function (o) { spec.noises.push(o); },
    };
    PATCHES[program](b, c);

    const cleanupAdd = function () { note.cleanup.add.apply(note.cleanup, arguments); };
    const stoppables = [];            // {node, end(abs)}
    const oscs = [];                  // every oscillator that follows pitch bend / vibrato

    /* ---- master envelope (gate) on the base note's gain node ---- */
    const m = spec.master;
    // Match the average RMS of the existing wavetable path so switching
    // between program 31 and 32 does not jump in level.
    const peakLevel = this.settings.instrumentAttenuation * 0.5 * dbToGain(TRIM_DB[program] || 0) * (m.lvl != null ? m.lvl : 1);
    const gp = note.gainNode.gain;
    const atk = Math.max(m.atk, 0.001);
    const mStages = toStages(m.decay);
    const tRelTau = Math.max(m.rel, 0.01) / 3;
    gp.setValueAtTime(0, t0);
    let t1 = t0 + atk, vStop;
    if (tStop <= t1) {
        // note-off during the attack: release from the partial attack level
        vStop = (tStop - t0) / atk;
        gp.linearRampToValueAtTime(vStop * peakLevel, tStop);
    } else {
        gp.linearRampToValueAtTime(peakLevel, t1);
        scheduleStages(gp, t1, peakLevel, mStages, tStop);
        vStop = stageValue(mStages, tStop - t1);
        gp.setValueAtTime(vStop * peakLevel, tStop);
    }
    gp.setTargetAtTime(0, tStop, tRelTau);
    const releaseEnd = tStop + TAIL * tRelTau;
    const masterNatEnd = t1 + stagesEnd(mStages);

    /* ---- voice filter ---- */
    const flt = note.filter;
    if (flt && spec.filt) {
        const fs = spec.filt;
        flt.type = fs.type || "lowpass";
        flt.Q.value = flt.type === "lowpass" || flt.type === "highpass" ? 20 * Math.log10(fs.q || 0.707) : (fs.q || 0.707);
        const f0 = Math.min(fs.f0, nyq);
        flt.frequency.setValueAtTime(f0, t0);
        if (fs.f1 != null && fs.f1 !== fs.f0) flt.frequency.setTargetAtTime(Math.min(fs.f1, nyq), t0 + 0.002, fs.tau || 0.3);
        if (fs.expr && option.expression) {
            // expression (CC11) opens the filter: louder = brighter, like the wavetable path does
            const base = Math.min(fs.f0, nyq);
            option.expression.forEach(function (p, i) {
                const t = Math.max(0, p.time + songStart + latency);
                const target = base * (0.45 + 0.55 * Math.pow(p.value / 127, 2)) + (Math.min(base * 2.2, nyq) - base) * Math.pow(p.value / 127, 4);
                if (i === 0 && t <= t0) flt.frequency.setValueAtTime(target, t0);
                else flt.frequency.linearRampToValueAtTime(target, t);
            });
        }
    } else if (flt) {
        flt.type = "allpass";
    }
    let tail = flt;
    spec.eq.forEach(function (e) {
        if (!tail) return;
        const bq = ctx.createBiquadFilter();
        bq.type = e.t;
        bq.frequency.value = Math.min(e.f, nyq);
        if (e.q != null) bq.Q.value = e.q;
        if (e.g != null) bq.gain.value = e.g;
        try { tail.disconnect(note.gainNode); } catch (err) { /* noop */ }
        tail.connect(bq);
        bq.connect(note.gainNode);
        tail = bq;
        cleanupAdd(bq);
    });

    /* ---- routing: parts -> bus (tremolo) -> [drive] -> base note pan input ---- */
    let input = note.panNode;
    if (!(typeof AudioNode !== "undefined" && input instanceof AudioNode)) {
        input = ctx.createGain();
        input.gain.value = note.velocity * 100 / 127;
        input.connect(note.filter || note.gainNode);
        cleanupAdd(input);
    }
    let sink = input;
    if (spec.drive) {
        const d = spec.drive;
        const post = ctx.createBiquadFilter();
        post.type = "lowpass";
        post.frequency.value = Math.min(d.post || 5000, nyq);
        post.Q.value = 0;
        post.connect(sink);
        const shaper = ctx.createWaveShaper();
        shaper.curve = getCurve(Math.max(d.pre, 0.5));
        try { shaper.oversample = "2x"; } catch (err) { /* noop */ }
        shaper.connect(post);
        const pre = ctx.createGain();
        pre.gain.value = 1;
        pre.connect(shaper);
        cleanupAdd(post, shaper, pre);
        sink = pre;
    }
    const bus = ctx.createGain();
    bus.connect(sink);
    cleanupAdd(bus);

    /* ---- shared LFO: vibrato (cents on every oscillator's detune), tremolo, CC1 ---- */
    const lf = spec.lfo || {};
    const hasMod = option.modulation && (option.modulation.length >= 2
        || (option.modulation.length > 0 && option.modulation[0].value > 0));
    let lfoOsc = null, vibGain = null, modGain = null;
    if ((lf.vib > 0) || lf.trem > 0 || hasMod) {
        lfoOsc = ctx.createOscillator();
        lfoOsc.frequency.value = lf.rate || 6;
        cleanupAdd(lfoOsc);
        if (lf.vib > 0) {
            vibGain = ctx.createGain();
            const d = lf.vibDelay || 0;
            vibGain.gain.setValueAtTime(0, t0);
            vibGain.gain.setValueAtTime(0, t0 + d);
            vibGain.gain.linearRampToValueAtTime(lf.vib, t0 + d + 0.35);
            lfoOsc.connect(vibGain);
            cleanupAdd(vibGain);
        }
        if (hasMod) {
            modGain = ctx.createGain();
            const centsScale = (1200 * 10) / (440 * Math.LN2);       // same depth as the wavetable path
            modGain.gain.value = Math.min(1, option.modulation[0].value / 127) * centsScale;
            option.modulation.forEach(function (p, i) {
                if (i === 0) return;
                modGain.gain.setValueAtTime(Math.min(1, p.value / 127) * centsScale, Math.max(0, p.time + songStart + latency));
            });
            lfoOsc.connect(modGain);
            cleanupAdd(modGain);
        }
        if (lf.trem > 0) {
            // amplitude LFO on the bus: gain swings between 1 and 1-depth
            bus.gain.value = 1 - lf.trem / 2;
            const tg = ctx.createGain();
            tg.gain.value = lf.trem / 2;
            lfoOsc.connect(tg);
            tg.connect(bus.gain);
            cleanupAdd(tg);
        }
        lfoOsc.start(t0);
        stoppables.push({ node: lfoOsc, end: Infinity });
    }

    /** connect pitch bend + vibrato + CC1 to an oscillator's detune */
    function tuneOsc(osc, cents) {
        osc.detune.value = cents;
        if (option.pitchBend) {
            option.pitchBend.forEach(function (p) {
                osc.detune.setValueAtTime(cents + p.value * 100, Math.max(0, p.time + songStart + latency));
            });
        }
        if (vibGain) vibGain.connect(osc.detune);
        if (modGain) modGain.connect(osc.detune);
        oscs.push(osc);
    }

    /* ---- parts ---- */
    // the longest-living part takes over the base note's oscillator (it anchors the note's lifetime)
    const partInfo = spec.parts.map(function (s) {
        const stages = toStages(s.decay);
        const pa = Math.max(s.atk != null ? s.atk : 0.002, 0.0015);
        return { s: s, stages: stages, atk: pa, end: t0 + pa + stagesEnd(stages) };
    });
    const noiseInfo = spec.noises.map(function (s) {
        const stages = toStages(s.decay);
        return { s: s, stages: stages, atk: Math.max(s.atk != null ? s.atk : 0.001, 0.0005), end: t0 + (s.delay || 0) + Math.max(s.atk || 0, 0.0005) + stagesEnd(stages) };
    });
    let longest = 0;
    partInfo.forEach(function (pi, i) { if (pi.end > partInfo[longest].end) longest = i; });
    const lastSource = Math.max.apply(null, partInfo.map(function (pi) { return pi.end; }).concat(noiseInfo.map(function (n) { return n.end; })));
    const voiceEnd = Math.max(Math.min(releaseEnd, masterNatEnd, lastSource) , t0 + 0.02);

    partInfo.forEach(function (pi, idx) {
        const s = pi.s;
        const osc = idx === longest ? note.oscillator : ctx.createOscillator();
        let wgain = 0.42;                                   // sine RMS compensation
        if (typeof s.wave === "string") {
            if (s.wave !== "sine" || osc.type !== "sine") osc.type = s.wave;
            if (s.wave !== "sine") wgain = s.wave === "sawtooth" ? 0.35 : 0.4;
        } else {
            const e = getPeriodic(ctx, s.wave, c.p + 12 * Math.log2(s.ratio || 1));
            osc.setPeriodicWave(e.pw);
            wgain = e.gain;
        }
        const fr = c.f * (s.ratio || 1);
        osc.frequency.value = Math.min(fr, nyq);
        tuneOsc(osc, s.cents || 0);
        const g = ctx.createGain();
        osc.connect(g);
        g.connect(bus);
        const lvl = (s.level != null ? s.level : 1) * wgain;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(lvl, t0 + pi.atk);
        scheduleStages(g.gain, t0 + pi.atk, lvl, pi.stages, Infinity);
        cleanupAdd(g);
        if (idx !== longest) { osc.start(t0); cleanupAdd(osc); }
        stoppables.push({ node: osc, end: idx === longest ? Infinity : Math.min(pi.end, voiceEnd) });

        // FM modulators: sine -> gain(index * modulator frequency) -> carrier.frequency
        (s.fm || []).forEach(function (fm) {
            const mf = Math.min(fr * fm.ratio, nyq);
            const mod = ctx.createOscillator();
            mod.frequency.value = mf;
            tuneOsc(mod, s.cents || 0);
            const mg = ctx.createGain();
            const idxPeak = fm.index * mf;
            const fst = toStages(fm.decay);
            mg.gain.setValueAtTime(idxPeak, t0);
            scheduleStages(mg.gain, t0, idxPeak, fst, Infinity);
            mod.connect(mg);
            mg.connect(osc.frequency);
            mod.start(t0);
            cleanupAdd(mod, mg);
            stoppables.push({ node: mod, end: Math.min(Math.max(pi.end, t0 + 0.05), voiceEnd) });
        });
    });

    /* ---- noises ---- */
    const wbuf = this.whitenoise;
    if (wbuf) {
        const norm = noiseNorm(wbuf);
        noiseInfo.forEach(function (ni) {
            const s = ni.s;
            const tn = t0 + (s.delay || 0);
            const src = ctx.createBufferSource();
            src.buffer = wbuf;
            src.loop = true;
            let node = src;
            if (s.filt) {
                const bq = ctx.createBiquadFilter();
                bq.type = s.filt.t;
                bq.frequency.value = Math.min(s.filt.f, nyq);
                const q = s.filt.q != null ? s.filt.q : 0.707;
                bq.Q.value = (bq.type === "lowpass" || bq.type === "highpass") ? 20 * Math.log10(q) : q;
                src.connect(bq);
                node = bq;
                cleanupAdd(bq);
            }
            const g = ctx.createGain();
            node.connect(g);
            g.connect(bus);
            const lvl = (s.level != null ? s.level : 1) * norm;
            g.gain.setValueAtTime(0, tn);
            g.gain.linearRampToValueAtTime(lvl, tn + ni.atk);
            scheduleStages(g.gain, tn + ni.atk, lvl, ni.stages, Infinity);
            src.start(tn, Math.random() * (wbuf.duration || 1));
            cleanupAdd(src, g);
            // sustained noise beds (decay >= 100 s) live as long as the voice
            stoppables.push({ node: src, end: ni.stages.length && ni.stages[ni.stages.length - 1][2] >= 100 ? voiceEnd : Math.min(ni.end, voiceEnd) });
        });
    }

    /* ---- stop everything at voice end ---- */
    stoppables.forEach(function (e) {
        if (e.node === note.oscillator) return;
        const end = e.end === Infinity ? voiceEnd : Math.min(e.end, voiceEnd);
        try { e.node.stop(end + 0.03); } catch (err) { /* noop */ }
    });
    this.stopAudioNode(note.oscillator, voiceEnd, note.stopGainNode);

    return function () {
        player.stopAudioNode(note.oscillator, 0, note.stopGainNode, true);
        const t = ctx.currentTime + 0.03;
        stoppables.forEach(function (e) { try { e.node.stop(t); } catch (err) { /* noop */ } });
    };
}


