/**
 * Sound quality 1 — synthesised percussion kit
 * =============================================
 * No samples, no wavetable: every drum is built from a handful of physical
 * "components" that are summed into ONE base note (one pan / velocity / reverb
 * path, and the channel volume applies to the whole drum):
 *
 *   tone()   a pitched oscillator: membrane modes, shell resonance, bell
 *            partials. Exponential pitch glides + multi-stage decays.
 *   noise()  looped noise through a filter chain (snare wires, stick click,
 *            hand clap, shakers, cymbal wash). Every hit starts at a random
 *            offset in the noise buffer, so repeated hits don't sound identical.
 *   bank()   several detuned square oscillators through filters: the classic
 *            inharmonic "metal" used for hats, cymbals and cowbell.
 *
 * Realism comes from (1) multi-stage decays (fast transient, slower body),
 * (2) exponential pitch glides, (3) velocity changing the *timbre* (brightness
 * and click level), not just the volume, and (4) hi-hat / whistle / guiro /
 * cuica / triangle / surdo choke groups.
 * Balance comes from TRIM_DB below: one number per drum, in dB.
 *
 * Tuning cheat-sheet:  KIT_GAIN = whole kit,  TRIM_DB[note] = one drum,
 *                      recipes (RECIPES[note]) = how a drum is built.
 */

const TAIL = 5.8;            // decay time-constants until a voice is ~-50 dB (sizes the voice lifetime)
const MIN_ATK = 0.0004;      // shortest attack ramp (avoids clicks)
const KIT_GAIN = 1;          // master trim for the whole kit

// Per-drum loudness trim in dB (+ = louder). Calibrated against a K-weighted
// loudness measurement so that the kit sits in a musical balance.
const TRIM_DB = {
    27: +7.3, 28: +13.6, 29: +6.0, 30: +5.6, 31: +5.0, 32: +15.5, 33: +7.5, 34: -3.0, 35: +7.3,
    36: +7.8, 37: +9.1, 38: +8.0, 39: +14.8, 40: +6.9, 41: +7.0, 42: +6.3, 43: +6.3, 44: +7.1,
    45: +5.9, 46: +2.1, 47: +5.5, 48: +5.2, 49: +5.5, 50: +5.1, 51: +1.0, 52: +7.5, 53: -2.9,
    54: +2.4, 55: +4.5, 56: +9.5, 57: +4.9, 58: +11.2, 59: +0.8, 60: +5.8, 61: +5.1, 62: +6.8,
    63: +3.9, 64: +3.7, 65: +5.7, 66: +5.6, 67: -0.1, 68: +0.4, 69: +6.1, 70: +9.1, 71: -2.1,
    72: -2.0, 73: +9.4, 74: +11.5, 75: +2.9, 76: +7.4, 77: +7.8, 78: +4.7, 79: +4.9, 80: -0.5,
    81: -6.5, 82: +4.2, 83: -3.2, 84: -1.6, 85: +7.5, 86: +6.7, 87: +6.2,
};

// Notes that cut each other off (GM exclusive classes). A later hit in the same
// group chokes any earlier hit that is still ringing.
const CHOKE_GROUP = {
    42: "hat", 44: "hat", 46: "hat",
    71: "whistle", 72: "whistle",
    73: "guiro", 74: "guiro",
    78: "cuica", 79: "cuica",
    80: "triangle", 81: "triangle",
    86: "surdo", 87: "surdo",
};

// Inharmonic square-wave set used for hats / cymbals / cowbell (Hz).
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

const REF_NOISE_RMS = 0.5774;   // RMS of uniform white noise in [-1, 1]
const noiseNorms = typeof WeakMap !== "undefined" ? new WeakMap() : null;
/** gain that makes a noise buffer behave like unit white noise (cached per buffer) */
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

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function dbToGain(db) { return Math.pow(10, db / 20); }

/* ------------------------------------------------------------------ */
/* Envelope helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Attack ramp + one or more exponential decay stages.
 * decay: number (single time constant to 0) or [[offset, targetFraction, tau], ...]
 * offset is seconds after the peak. A stage may also rise (targetFraction > 1 or
 * above the current level). Returns the envelope length (s) until ~-50 dB.
 */
function applyEnv(param, t0, peak, atk, decay) {
    const a = Math.max(atk, MIN_ATK);
    param.setValueAtTime(0, t0);
    param.linearRampToValueAtTime(peak, t0 + a);
    const stages = typeof decay === "number" ? [[0, 0, decay]] : decay;
    let end = a;
    for (let i = 0; i < stages.length; i++) {
        const st = stages[i];
        // A sustain before the first decay stage is held with an explicit event:
        // some engines (older WebKit among them) don't hold a ramp's end value
        // until a later setTargetAtTime starts.
        if (i === 0 && st[0] > 0) param.setValueAtTime(peak, t0 + a + st[0]);
        param.setTargetAtTime(st[1] * peak, t0 + a + st[0], st[2]);
        end = Math.max(end, a + st[0] + st[2] * (st[1] === 0 ? TAIL : 2));
    }
    return end;
}

/** Train of short decaying pulses: [[time, relativeAmp, tau], ...] */
function applyPulses(param, t0, pulses, peak) {
    param.setValueAtTime(0, t0);
    let end = 0;
    for (let i = 0; i < pulses.length; i++) {
        const p = pulses[i];
        param.setValueAtTime(p[1] * peak, t0 + p[0]);
        param.setTargetAtTime(0, t0 + p[0], p[2]);
        end = Math.max(end, p[0] + p[2] * TAIL);
    }
    return end;
}

/** Frequency schedule: {path:[[t,f],...]} (exp glide) | {f, to, tau} (exp approach) | {steps} */
function applyFreq(param, t0, s) {
    if (s.path) {
        const ramp = s.lin ? "linearRampToValueAtTime" : "exponentialRampToValueAtTime";
        param.setValueAtTime(s.path[0][1], t0 + s.path[0][0]);
        for (let i = 1; i < s.path.length; i++) param[ramp](s.path[i][1], t0 + s.path[i][0]);
    } else if (s.steps) {
        for (let i = 0; i < s.steps.length; i++) param.setValueAtTime(s.steps[i][1], t0 + s.steps[i][0]);
    } else {
        param.setValueAtTime(s.f, t0);
        if (s.to != null) param.setTargetAtTime(s.to, t0, s.tau || 0.03);
    }
}

/* ------------------------------------------------------------------ */
/* Voice builder                                                       */
/* ------------------------------------------------------------------ */

function createVoice(player, ctx, note, start) {
    const nyq = ctx.sampleRate * 0.45;
    const sources = [];     // {node, end}  end = seconds after `start`
    let total = 0;

    // Everything is routed into the base note's pan input, so pan, velocity,
    // channel volume, reverb/chorus sends and cleanup all behave like any other note.
    let input = note.panNode;
    if (!(typeof AudioNode !== "undefined" && input instanceof AudioNode)) {
        // No StereoPanner / Panner support at all: feed the post-pan stage directly.
        input = ctx.createGain();
        input.gain.value = note.velocity * 100 / 127;
        input.connect(note.filter || note.gainNode);
        note.cleanup.add(input);
    }

    function own() { note.cleanup.add.apply(note.cleanup, arguments); }

    function register(node, end) {
        sources.push({ node: node, end: end });
        if (end > total) total = end;
    }

    function makeFilters(specs, t0) {
        const nodes = [];
        (specs || []).forEach(function (s) {
            const bq = ctx.createBiquadFilter();
            bq.type = s.t;
            bq.frequency.setValueAtTime(Math.min(s.f, nyq), t0);
            if (s.to != null) bq.frequency.setTargetAtTime(Math.min(s.to, nyq), t0, s.tau || 0.05);
            const q = s.q != null ? s.q : 0.707;
            // WebAudio low/high-pass Q is in dB; everything else is linear.
            bq.Q.value = (s.t === "lowpass" || s.t === "highpass") ? 20 * Math.log10(q) : q;
            if (s.g != null) bq.gain.value = s.g;
            nodes.push(bq);
        });
        for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
        return nodes;
    }

    /** source -> filters -> [tremolo] -> envelope gain -> input. Returns env length. */
    function tail(first, s, t0) {
        const filters = makeFilters(s.filt, t0);
        let node = first;
        filters.forEach(function (f) { node.connect(f); node = f; });
        if (s.am) {
            const amGain = ctx.createGain();
            amGain.gain.value = 1 - s.am.depth / 2;
            const lfo = ctx.createOscillator();
            const lfoGain = ctx.createGain();
            lfo.frequency.value = s.am.f;
            lfoGain.gain.value = s.am.depth / 2;
            lfo.connect(lfoGain);
            lfoGain.connect(amGain.gain);
            node.connect(amGain);
            node = amGain;
            own(amGain, lfo, lfoGain);
            s._lfo = lfo;
        }
        const g = ctx.createGain();
        node.connect(g);
        g.connect(input);
        const level = s.level != null ? s.level : 1;
        const dur = s.pulses
            ? applyPulses(g.gain, t0, s.pulses, level)
            : applyEnv(g.gain, t0, level, s.atk != null ? s.atk : 0.001, s.decay);
        own(g);
        filters.forEach(function (f) { own(f); });
        if (s._lfo) { s._lfo.start(t0); register(s._lfo, (s.delay || 0) + dur); }
        return dur;
    }

    const api = {
        /** pitched oscillator */
        tone: function (s) {
            const t0 = start + (s.delay || 0);
            const osc = ctx.createOscillator();
            osc.type = s.type || "sine";
            applyFreq(osc.frequency, t0, s);
            if (s.fm) {
                const lfo = ctx.createOscillator();
                const lg = ctx.createGain();
                lfo.frequency.value = s.fm.f;
                lg.gain.value = s.fm.depth;
                lfo.connect(lg);
                lg.connect(osc.frequency);
                lfo.start(t0);
                own(lfo, lg);
                s._fm = lfo;
            }
            const dur = tail(osc, s, t0);
            osc.start(t0);
            own(osc);
            register(osc, (s.delay || 0) + dur);
            if (s._fm) register(s._fm, (s.delay || 0) + dur);
        },

        /** looped white noise (RMS-normalised, random start offset per hit) */
        noise: function (s) {
            const b = player.whitenoise;
            if (!b) return;
            const t0 = start + (s.delay || 0);
            const src = ctx.createBufferSource();
            src.buffer = b;
            src.loop = true;
            if (s.rate) src.playbackRate.value = s.rate;
            // levels are defined for unit-RMS-equivalent noise, whatever the buffer's own amplitude is
            const norm = noiseNorm(b);
            const s2 = Object.assign({}, s, { level: (s.level != null ? s.level : 1) * norm });
            if (s2.pulses) { /* pulse amps are relative to level, nothing to do */ }
            const dur = tail(src, s2, t0);
            src.start(t0, Math.random() * (b.duration || 1));
            own(src);
            register(src, (s.delay || 0) + dur);
        },

        /** several oscillators mixed through one filter chain / envelope */
        bank: function (s) {
            const t0 = start + (s.delay || 0);
            const mix = ctx.createGain();
            mix.gain.value = 1 / Math.sqrt(s.freqs.length);
            const oscs = s.freqs.map(function (f) {
                const o = ctx.createOscillator();
                o.type = s.type || "square";
                o.frequency.value = f;
                o.connect(mix);
                return o;
            });
            const dur = tail(mix, s, t0);
            own(mix);
            oscs.forEach(function (o) {
                o.start(t0);
                own(o);
                register(o, (s.delay || 0) + dur);
            });
        },
    };

    api.length = function () { return total; };

    /** schedule every source to stop `limit` seconds after start (or at its own end) */
    api.stopAll = function (limit) {
        sources.forEach(function (e) {
            try { e.node.stop(start + Math.min(e.end, limit) + 0.03); } catch (err) { /* noop */ }
        });
    };
    api.stopNow = function () {
        const t = ctx.currentTime + 0.03;
        sources.forEach(function (e) { try { e.node.stop(t); } catch (err) { /* noop */ } });
    };
    return api;
}

/* ------------------------------------------------------------------ */
/* Recipes                                                             */
/* v = { vel: 0..1, soft: click level 0.4..1, br: brightness 0.75..1.25 } */
/* ------------------------------------------------------------------ */

const RECIPES = {};

function kick(p) {
    return function (k, v) {
        const path = [[0, p.f[0] * (0.78 + 0.22 * v.vel)], [0.012, p.f[1]], [p.sweep, p.f[2]]];
        // hold the low body for ~40ms before the tail, otherwise the 50Hz
        // fundamental never gets a full cycle and the kick reads as a click.
        k.tone({ path: path, level: 1, atk: 0.0012, decay: [[0.04, 0.85, 0.02], [0.055, 0, p.tail]] });
        // triangle copy: upper harmonics so the kick still reads on small speakers
        k.tone({ type: "triangle", path: path, level: 0.45, atk: 0.001, decay: 0.04,
            filt: [{ t: "lowpass", f: 900, q: 0.7 }] });
        // beater click
        k.noise({ filt: [{ t: "bandpass", f: p.click * v.br, q: 1.0 }, { t: "lowpass", f: 8000 }],
            level: 0.7 * v.soft, atk: 0.0004, decay: 0.0035 });
        // low, short noise body (the old kick had this under the beater click)
        k.noise({ rate: 0.25, filt: [{ t: "lowpass", f: 12000, to: 1000, tau: 0.003, q: 0.7 }],
            level: 0.45 * v.soft, atk: 0.004, decay: 0.004 });
    };
}
RECIPES[36] = kick({ f: [175, 95, 52], sweep: 0.07, tail: 0.04, click: 3000 });
RECIPES[35] = kick({ f: [150, 88, 56], sweep: 0.18, tail: 0.095, click: 2000 });

function snare(p) {
    return function (k, v) {
        // shell: fundamental + second mode, quick pitch drop at the strike
        k.tone({ path: [[0, p.f * 1.35], [0.012, p.f]], level: 1.0, atk: 0.0015,
            decay: [[0, 0.55, 0.012], [0.03, 0, p.shell]] });
        k.tone({ f: p.f * 1.72, level: 0.3, atk: 0.0015, decay: p.shell * 0.6 });
        // snare wires (the burst is deliberately not much louder than the body: keeps the crest factor sane)
        k.noise({ filt: [{ t: "highpass", f: p.hp * v.br, q: 0.7 },
            { t: "peaking", f: p.pk, q: 0.9, g: 4 }, { t: "lowpass", f: 7500 + 4500 * v.vel, q: 0.6 }],
            level: 0.85 * (0.55 + 0.45 * v.vel), atk: 0.0012, decay: [[0, 0.6, 0.012], [0.03, 0, p.wire]] });
        // stick, slightly after the wires start so the two transients don't stack
        k.noise({ filt: [{ t: "bandpass", f: 3800, q: 1.1 }], level: 0.24 * v.soft, delay: 0.0006, atk: 0.0004, decay: 0.003 });
    };
}
RECIPES[38] = snare({ f: 188, shell: 0.045, hp: 1300, pk: 4800, wire: 0.05 });
RECIPES[40] = snare({ f: 208, shell: 0.04, hp: 1900, pk: 6200, wire: 0.04 });

RECIPES[37] = function (k, v) {  // side stick
    k.tone({ path: [[0, 420], [0.006, 300]], level: 0.8, atk: 0.0005, decay: [[0, 0.2, 0.006], [0.012, 0, 0.02]] });
    k.tone({ f: 1750, level: 0.35, atk: 0.0004, decay: 0.008 });
    k.noise({ filt: [{ t: "bandpass", f: 3200, q: 1.2 }], level: 0.5 * v.soft, atk: 0.0003, decay: 0.004 });
};

RECIPES[39] = function (k, v) {  // hand clap: several flams + a short room tail
    const bursts = [[0, 0.8, 0.0035], [0.0105, 0.7, 0.0035], [0.0215, 0.85, 0.004], [0.032, 1, 0.03]];
    k.noise({ filt: [{ t: "bandpass", f: 1500 * v.br, q: 0.9 }, { t: "highpass", f: 500, q: 0.7 }], level: 1, pulses: bursts });
    k.noise({ filt: [{ t: "bandpass", f: 3200, q: 1.2 }], level: 0.3, pulses: bursts });
};

function tom(f0, tau) {
    return function (k, v) {
        const hi = f0 * (1.12 + 0.2 * v.vel);
        k.tone({ path: [[0, hi], [0.055, f0]], level: 1, atk: 0.0015, decay: [[0, 0.6, 0.03], [0.06, 0, tau]] });
        k.tone({ path: [[0, hi * 1.59], [0.055, f0 * 1.59]], level: 0.22, atk: 0.001, decay: tau * 0.5 });
        k.noise({ filt: [{ t: "bandpass", f: 2600 * v.br, q: 0.9 }], level: 0.22 * v.soft, atk: 0.0004, decay: 0.006 });
        // slowed white noise gives the tom its skin/attack noise
        k.noise({ rate: 0.4, filt: [{ t: "lowpass", f: 1200, q: 0.7 }], level: 0.7 * v.soft, atk: 0.001, decay: 0.006 });
    };
}
RECIPES[41] = tom(82, 0.085);
RECIPES[43] = tom(98, 0.08);
RECIPES[45] = tom(116, 0.07);
RECIPES[47] = tom(138, 0.065);
RECIPES[48] = tom(164, 0.06);
RECIPES[50] = tom(196, 0.055);

function hat(p) {
    return function (k, v) {
        k.noise({ filt: [{ t: "highpass", f: p.hp * v.br, q: 0.7 }, { t: "lowpass", f: p.lp * (0.8 + 0.2 * v.br), q: 0.7 },
            { t: "peaking", f: p.pk, q: 0.8, g: 3 }], level: p.n, atk: 0.0006, decay: p.env });
        k.bank({ freqs: METAL.map(function (f) { return f * p.m; }),
            filt: [{ t: "highpass", f: p.hp * 1.1, q: 0.7 }, { t: "bandpass", f: p.bp, q: 0.7 }],
            level: p.b, atk: 0.0006, decay: p.env });
        if (p.foot) k.tone({ path: [[0, 190], [0.02, 110]], level: p.foot, atk: 0.001, decay: 0.02 });
    };
}
RECIPES[42] = hat({ hp: 4300, lp: 14000, pk: 9500, n: 1, b: 0.45, m: 1, bp: 9000, env: [[0, 0.35, 0.006], [0.014, 0, 0.022]] });
RECIPES[44] = hat({ hp: 3800, lp: 12000, pk: 8000, n: 0.7, b: 0.3, m: 0.9, bp: 7500, env: [[0, 0.3, 0.005], [0.01, 0, 0.016]], foot: 0.12 });
RECIPES[46] = hat({ hp: 3600, lp: 14500, pk: 9000, n: 1, b: 0.45, m: 1, bp: 8500, env: [[0, 0.55, 0.025], [0.1, 0, 0.115]] });

function cymbal(p) {
    return function (k, v) {
        const lp = { t: "lowpass", f: p.lp0 * v.br, to: p.lp1, tau: p.lpTau, q: 0.7 };
        k.noise({ filt: [{ t: "highpass", f: p.hp, q: 0.7 }, lp], level: p.n, atk: p.atk || 0.001, decay: p.env, am: p.am });
        k.bank({ freqs: METAL.map(function (f) { return f * p.m; }),
            filt: [{ t: "highpass", f: p.hp, q: 0.7 }, lp], level: p.b, atk: p.atk || 0.001, decay: p.env });
        if (p.body) k.noise({ filt: [{ t: "bandpass", f: p.body, q: 0.8 }], level: p.bl, atk: 0.002, decay: p.benv });
        (p.ring || []).forEach(function (r) { k.tone({ f: r[0], level: r[1], atk: 0.0006, decay: r[2] }); });
    };
}
RECIPES[49] = cymbal({ hp: 2800, lp0: 16000, lp1: 6500, lpTau: 0.5, n: 0.9, b: 0.35, m: 1.3,
    env: [[0, 0.5, 0.06], [0.3, 0, 0.38]], body: 750, bl: 0.25, benv: 0.22 });
RECIPES[57] = cymbal({ hp: 3200, lp0: 17000, lp1: 7500, lpTau: 0.4, n: 0.9, b: 0.35, m: 1.5,
    env: [[0, 0.5, 0.05], [0.25, 0, 0.32]], body: 900, bl: 0.2, benv: 0.18 });
RECIPES[55] = cymbal({ hp: 4200, lp0: 18000, lp1: 9000, lpTau: 0.3, n: 0.9, b: 0.35, m: 1.9,
    env: [[0, 0.45, 0.04], [0.18, 0, 0.2]], body: 1200, bl: 0.12, benv: 0.12 });
RECIPES[52] = cymbal({ hp: 1800, lp0: 12000, lp1: 5000, lpTau: 0.35, n: 0.9, b: 0.4, m: 0.85,
    env: [[0, 0.45, 0.05], [0.2, 0, 0.25]], body: 600, bl: 0.2, benv: 0.15, am: { f: 22, depth: 0.5 } });

function ride(p) {
    return function (k, v) {
        const lp = { t: "lowpass", f: 14000 * v.br, to: 8000, tau: 0.4, q: 0.7 };
        k.noise({ filt: [{ t: "highpass", f: 4500, q: 0.7 }, lp], level: 0.35, atk: 0.0008,
            decay: [[0, 0.3, 0.03], [0.1, 0, 0.3]] });
        k.bank({ freqs: METAL.map(function (f) { return f * p.m; }),
            filt: [{ t: "highpass", f: 4500, q: 0.7 }, lp], level: 0.3, atk: 0.0008, decay: [[0, 0.3, 0.03], [0.1, 0, 0.3]] });
        // "ping" of the stick on the bow
        [[p.ping, 0.5, 0.18], [p.ping * 1.8, 0.3, 0.1], [p.ping * 2.65, 0.2, 0.06]].forEach(function (r) {
            k.tone({ f: r[0], level: r[1], atk: 0.0005, decay: r[2] });
        });
        k.noise({ filt: [{ t: "bandpass", f: 5000, q: 1 }], level: 0.35 * v.soft, atk: 0.0003, decay: 0.004 });
    };
}
RECIPES[51] = ride({ m: 1.1, ping: 1900 });
RECIPES[59] = ride({ m: 1.2, ping: 2050 });

RECIPES[53] = function (k, v) {  // ride bell
    [[705, 1, 0.28], [1380, 0.6, 0.2], [2290, 0.55, 0.16], [3410, 0.4, 0.12], [4800, 0.25, 0.08]].forEach(function (r) {
        k.tone({ f: r[0], level: r[1], atk: 0.0005, decay: r[2] });
    });
    k.noise({ filt: [{ t: "highpass", f: 6000, q: 0.7 }], level: 0.15, atk: 0.0005, decay: 0.2 });
    k.noise({ filt: [{ t: "bandpass", f: 4500, q: 1 }], level: 0.4 * v.soft, atk: 0.0003, decay: 0.004 });
};

RECIPES[54] = function (k, v) {  // tambourine
    const env = { atk: 0.002, decay: [[0, 0.5, 0.015], [0.03, 0, 0.075]] };
    k.noise(Object.assign({ filt: [{ t: "highpass", f: 4500 * v.br, q: 0.7 }, { t: "peaking", f: 8500, q: 1, g: 5 }], level: 1 }, env));
    k.bank(Object.assign({ freqs: [4130, 5230, 6180, 7340, 8590, 9810, 11210],
        filt: [{ t: "highpass", f: 5000, q: 0.7 }], level: 0.2 }, env));
    k.tone({ path: [[0, 250], [0.03, 180]], level: 0.15, atk: 0.001, decay: 0.02 });
};

RECIPES[56] = function (k, v) {  // cowbell
    k.bank({ freqs: [587, 845], filt: [{ t: "bandpass", f: 1800, q: 1.2 }, { t: "lowpass", f: 5200, q: 0.7 }],
        level: 1, atk: 0.0005, decay: [[0, 0.4, 0.01], [0.04, 0, 0.075]] });
    k.noise({ filt: [{ t: "bandpass", f: 3000, q: 1.2 }], level: 0.25 * v.soft, atk: 0.0003, decay: 0.004 });
};

RECIPES[58] = function (k, v) {  // vibraslap: ball rattle that accelerates
    const pulses = [];
    let t = 0, iv = 0.07;
    for (let i = 0; i < 28; i++) {
        pulses.push([t, 1 - i / 40, 0.005]);
        t += Math.max(0.0075, iv);
        iv *= 0.9;
    }
    k.noise({ filt: [{ t: "bandpass", f: 2600, q: 0.9 }, { t: "highpass", f: 900, q: 0.7 }], level: 0.9, pulses: pulses });
    k.tone({ f: 860, level: 0.4, pulses: pulses.map(function (p) { return [p[0], p[1], 0.014]; }) });
};

function head(p) {  // hand drums (bongo / conga / timbale head)
    return function (k, v) {
        k.tone({ path: [[0, p.f * p.g], [0.03, p.f]], level: 1, atk: 0.001,
            decay: [[0, 0.45, p.tau * 0.35], [p.tau * 0.8, 0, p.tau]] });
        k.tone({ path: [[0, p.f * p.g * 1.59], [0.03, p.f * 1.59]], level: 0.3, atk: 0.001, decay: p.tau * 0.5 });
        k.tone({ path: [[0, p.f * p.g * 2.14], [0.03, p.f * 2.14]], level: 0.15, atk: 0.001, decay: p.tau * 0.3 });
        k.noise({ filt: [{ t: "bandpass", f: 1800 * v.br, q: 1.2 }], level: p.sl * v.soft, atk: 0.0004, decay: 0.006 });
        if (p.ring) k.tone({ f: p.ring, level: 0.18, atk: 0.0005, decay: 0.12 });
        if (p.crack) k.noise({ filt: [{ t: "bandpass", f: 5000, q: 1 }], level: p.crack * v.soft, atk: 0.0003, decay: 0.005 });
    };
}
RECIPES[60] = head({ f: 440, g: 1.06, tau: 0.045, sl: 0.5 });
RECIPES[61] = head({ f: 310, g: 1.06, tau: 0.055, sl: 0.5 });
RECIPES[62] = head({ f: 330, g: 1.1, tau: 0.02, sl: 0.7 });
RECIPES[63] = head({ f: 320, g: 1.1, tau: 0.09, sl: 0.55 });
RECIPES[64] = head({ f: 240, g: 1.1, tau: 0.1, sl: 0.5 });
RECIPES[65] = head({ f: 480, g: 1.04, tau: 0.05, sl: 0.3, ring: 2650, crack: 0.5 });
RECIPES[66] = head({ f: 360, g: 1.04, tau: 0.055, sl: 0.3, ring: 2050, crack: 0.5 });

function bell(f0, taus, click) {  // agogo
    return function (k, v) {
        [[1, 1, taus[0]], [2.76, 0.45, taus[1]], [5.4, 0.15, taus[2]]].forEach(function (r) {
            k.tone({ f: f0 * r[0], level: r[1], atk: 0.0004, decay: r[2] });
        });
        k.noise({ filt: [{ t: "bandpass", f: click, q: 1.2 }], level: 0.3 * v.soft, atk: 0.0003, decay: 0.003 });
    };
}
RECIPES[67] = bell(1350, [0.09, 0.05, 0.025], 4500);
RECIPES[68] = bell(990, [0.1, 0.055, 0.03], 3800);

RECIPES[69] = function (k, v) {  // cabasa
    k.noise({ filt: [{ t: "highpass", f: 4000, q: 0.7 }, { t: "bandpass", f: 7500 * v.br, q: 0.7 }],
        level: 1, atk: 0.012, decay: 0.022 });
};
RECIPES[70] = function (k, v) {  // maracas
    k.noise({ filt: [{ t: "highpass", f: 3500, q: 0.7 }, { t: "bandpass", f: 6000 * v.br, q: 0.6 }],
        level: 1, pulses: [[0, 1, 0.008], [0.018, 0.6, 0.015]] });
};
RECIPES[82] = function (k, v) {  // shaker
    k.noise({ filt: [{ t: "highpass", f: 3000, q: 0.7 }, { t: "bandpass", f: 5200 * v.br, q: 0.6 }],
        level: 1, atk: 0.016, decay: [[0, 0.35, 0.015], [0.03, 0, 0.035]] });
};

function whistle(f, len) {
    return function (k, v) {
        const env = { atk: 0.015, decay: [[len, 0, 0.015]] };
        k.tone(Object.assign({ f: f, level: 1, fm: { f: 26, depth: f * 0.025 }, am: { f: 26, depth: 0.45 } }, env));
        k.tone(Object.assign({ f: f * 2, level: 0.12, fm: { f: 26, depth: f * 0.05 } }, env));
        k.noise(Object.assign({ filt: [{ t: "bandpass", f: f * 1.1, q: 4 }], level: 0.25 }, env));
    };
}
RECIPES[71] = whistle(2750, 0.13);
RECIPES[72] = whistle(2400, 0.5);

function guiro(n, len) {
    return function (k, v) {
        const pulses = [];
        for (let i = 0; i < n; i++) pulses.push([len * i / (n - 1), 0.7 + 0.3 * (i % 2), 0.003]);
        k.noise({ filt: [{ t: "bandpass", f: 2800 * v.br, q: 1.3 }], level: 1, pulses: pulses });
        k.tone({ f: 1400, level: 0.25, pulses: pulses.map(function (p) { return [p[0], p[1], 0.006]; }) });
    };
}
RECIPES[73] = guiro(8, 0.08);
RECIPES[74] = guiro(22, 0.45);

RECIPES[75] = function (k, v) {  // claves
    k.tone({ f: 2500, level: 1, atk: 0.0004, decay: 0.012 });
    k.tone({ f: 5100, level: 0.25, atk: 0.0004, decay: 0.006 });
    k.noise({ filt: [{ t: "bandpass", f: 4000, q: 1.5 }], level: 0.3 * v.soft, atk: 0.0003, decay: 0.003 });
};

function wood(f) {
    return function (k, v) {
        k.tone({ path: [[0, f * 1.07], [0.01, f]], level: 1, atk: 0.0004, decay: [[0, 0.3, 0.006], [0.012, 0, 0.02]] });
        k.tone({ f: f * 2.4, level: 0.25, atk: 0.0004, decay: 0.008 });
        k.noise({ filt: [{ t: "bandpass", f: f * 3.2, q: 1.4 }], level: 0.35 * v.soft, atk: 0.0003, decay: 0.003 });
    };
}
RECIPES[76] = wood(900);
RECIPES[77] = wood(650);

function cuica(open) {
    return function (k, v) {
        const path = open ? [[0, 260], [0.05, 300], [0.14, 360], [0.3, 290]]
            : [[0, 640], [0.04, 720], [0.12, 830], [0.18, 700]];
        const len = open ? 0.32 : 0.18;
        const env = { atk: 0.012, decay: [[len * 0.7, 0, 0.03]] };
        k.tone(Object.assign({ type: "sawtooth", path: path, level: 0.8,
            filt: [{ t: "bandpass", f: open ? 700 : 1500, q: 1.5 }, { t: "lowpass", f: 3000, q: 0.7 }],
            fm: { f: 9, depth: path[0][1] * 0.02 } }, env));
        k.tone(Object.assign({ path: path, level: 0.35 }, env));
    };
}
RECIPES[78] = cuica(false);
RECIPES[79] = cuica(true);

function triangle(tau) {
    return function (k, v) {
        const F = [1100, 3036, 5940, 9823], L = [0.25, 1, 0.7, 0.35], S = [1, 0.8, 0.6, 0.4];
        F.forEach(function (f, i) { k.tone({ f: f, level: L[i], atk: 0.0004, decay: tau * S[i] }); });
        k.noise({ filt: [{ t: "highpass", f: 5000, q: 0.7 }], level: 0.15 * v.soft, atk: 0.0003, decay: 0.004 });
    };
}
RECIPES[80] = triangle(0.035);
RECIPES[81] = triangle(0.28);

RECIPES[83] = function (k, v) {  // jingle bell
    k.bank({ type: "sine", freqs: [3500, 4150, 5200, 6000, 7200], level: 1, atk: 0.012, decay: [[0, 0.4, 0.04], [0.06, 0, 0.08]] });
    k.noise({ filt: [{ t: "bandpass", f: 7000, q: 1 }], level: 0.5, pulses: [[0, 0.8, 0.01], [0.02, 0.6, 0.01], [0.045, 0.5, 0.012]] });
};

RECIPES[84] = function (k, v) {  // bell tree: downward run of chimes, 6 round-robin voices
    const N = 24, V = 6, span = 0.45;
    for (let vi = 0; vi < V; vi++) {
        const steps = [], pulses = [];
        for (let i = vi; i < N; i += V) {
            const t = i / N * span, f = 3400 * Math.pow(0.5, i / (N - 1));
            steps.push([t, f]);
            pulses.push([t, 0.5 + 0.5 * i / N, 0.14]);
        }
        k.tone({ type: "triangle", steps: steps, pulses: pulses, level: 0.5 });
    }
    k.bank({ type: "sine", freqs: [1700, 2100, 2750, 3400], level: 0.25, delay: span * 0.6, atk: 0.05, decay: 0.25 });
};

RECIPES[85] = function (k, v) {  // castanets: double click
    [0, 0.007].forEach(function (d, i) {
        k.noise({ filt: [{ t: "bandpass", f: 2600, q: 1.3 }], level: (i ? 0.8 : 1), delay: d, atk: 0.0003, decay: 0.005 });
        k.tone({ f: 1900, level: 0.4, delay: d, atk: 0.0003, decay: 0.01 });
    });
};

function surdo(tau) {
    return function (k, v) {
        k.tone({ path: [[0, 102], [0.04, 86]], level: 1, atk: 0.002, decay: [[0, 0.6, 0.03], [0.06, 0, tau]] });
        k.tone({ path: [[0, 102 * 1.59], [0.04, 86 * 1.59]], level: 0.2, atk: 0.002, decay: tau * 0.4 });
        k.noise({ filt: [{ t: "lowpass", f: 400, q: 0.7 }], level: 0.3, atk: 0.001, decay: 0.02 });
        k.noise({ filt: [{ t: "bandpass", f: 1500, q: 0.9 }], level: 0.12 * v.soft, atk: 0.0003, decay: 0.004 });
    };
}
RECIPES[86] = surdo(0.05);
RECIPES[87] = surdo(0.22);

RECIPES[27] = function (k, v) {  // High Q
    k.tone({ path: [[0, 1300], [0.014, 300], [0.07, 260]], level: 0.9, atk: 0.0005, decay: [[0, 0.3, 0.01], [0.02, 0, 0.018]] });
    k.noise({ filt: [{ t: "bandpass", f: 2500, q: 1 }], level: 0.25 * v.soft, atk: 0.0003, decay: 0.003 });
};
RECIPES[28] = function (k, v) {  // Slap
    k.noise({ filt: [{ t: "bandpass", f: 1900 * v.br, q: 0.8 }, { t: "highpass", f: 600, q: 0.7 }],
        level: 1, pulses: [[0, 1, 0.003], [0.011, 0.8, 0.003], [0.022, 0.65, 0.02]] });
    k.tone({ path: [[0, 360], [0.03, 170]], level: 0.35, atk: 0.001, decay: 0.025 });
};

function scratch(push) {
    const T = push ? [0.05, 0.06, 0.07, 0.10, 0.25] : [0.07, 0.09, 0.11, 0.15, 0.40];
    const F = push ? [500, 1950, 70, 1950, 430, 70] : [400, 1200, 70, 1200, 250, 70];
    const env = { atk: T[0], decay: [[T[1] - T[0], 0.08, 0.005], [T[2] - T[0], 0.55, 0.01], [T[3] - T[0], 0, (T[4] - T[3]) / 3]] };
    return function (k, v) {
        k.tone(Object.assign({ type: "sawtooth", lin: true,
            path: [[0, F[0]], [T[0], F[1]], [T[1], F[2]], [T[2], F[3]], [T[3], F[4]], [T[4], F[5]]],
            filt: [{ t: "lowpass", f: 3800, q: 0.9 }, { t: "highpass", f: 300, q: 0.7 }], level: 0.7 }, env));
        k.noise(Object.assign({ filt: [{ t: "bandpass", f: 3000, q: 0.9 }], level: 0.3 }, env));
    };
}
RECIPES[29] = scratch(true);
RECIPES[30] = scratch(false);

RECIPES[31] = function (k, v) {  // sticks
    k.tone({ f: 2900, level: 0.7, atk: 0.0004, decay: 0.007 });
    k.tone({ f: 1050, level: 0.3, atk: 0.0004, decay: 0.012 });
    k.noise({ filt: [{ t: "bandpass", f: 4500, q: 1.4 }], level: 0.7 * v.soft, atk: 0.0003, decay: 0.005 });
};
RECIPES[32] = function (k, v) {  // square click
    k.tone({ type: "square", f: 333, level: 0.5, atk: 0.0006, decay: 0.0012, filt: [{ t: "lowpass", f: 5000, q: 0.7 }] });
};
RECIPES[33] = function (k, v) {  // metronome click
    k.tone({ f: 1700, level: 0.8, atk: 0.0004, decay: 0.005 });
    k.noise({ filt: [{ t: "bandpass", f: 3000, q: 1.2 }], level: 0.3 * v.soft, atk: 0.0003, decay: 0.003 });
};
RECIPES[34] = function (k, v) {  // metronome bell
    [[1, 1, 0.2], [2.76, 0.3, 0.08], [5.4, 0.12, 0.04]].forEach(function (r) {
        k.tone({ f: 2040 * r[0], level: r[1], atk: 0.0004, decay: r[2] });
    });
    k.noise({ filt: [{ t: "bandpass", f: 3000, q: 1.2 }], level: 0.3 * v.soft, atk: 0.0003, decay: 0.003 });
};

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

const silentBuffers = typeof WeakMap !== "undefined" ? new WeakMap() : null;
function getSilentBuffer(ctx) {
    let b = silentBuffers && silentBuffers.get(ctx);
    if (!b) {
        b = ctx.createBuffer(1, 1, ctx.sampleRate);   // one sample of silence
        if (silentBuffers) silentBuffers.set(ctx, b);
    }
    return b;
}

function chokeEarlier(player, ctx, group, start, end, gainParam) {
    const reg = player.__drumChoke || (player.__drumChoke = {});
    const list = (reg[group] || []).filter(function (e) { return e.end > ctx.currentTime; });
    list.forEach(function (e) {
        if (e.start < start - 0.001 && e.end > start) {
            try { e.gain.setTargetAtTime(0, start, 0.004); } catch (err) { /* noop */ }
            e.end = start + 0.03;
        }
    });
    list.push({ start: start, end: end, gain: gainParam });
    reg[group] = list;
}

/**
 * Renders one quality-1 percussion hit. Call with `this` = the player.
 * @returns {null | function} null when silent, otherwise a function that stops the drum.
 */
export default function createSynthKitNote(option) {
    const ctx = this.context;
    const note = this.createBaseNote(option, true, false, false, false, true);
    if (note.isGainValueZero) return null;

    // The base note's buffer source is only an anchor here (left silent): when it
    // ends, the base note disconnects every node of the drum.
    // It gets a 1-frame looping silent buffer: a source without any buffer may be
    // treated as "already finished" by some engines, which fires onended at once.
    const anchor = note.oscillator;
    anchor.buffer = getSilentBuffer(ctx);
    if (note.filter) note.filter.type = "allpass";

    let start = note.start;
    // automation scheduled in the past is ignored, so never start before "now"
    if (start < ctx.currentTime) start = ctx.currentTime;

    const pitch = option.pitch;
    const vel = clamp(Number(option.velocity) || 0, 0, 1);
    const v = { vel: vel, soft: 0.4 + 0.6 * vel, br: 0.75 + 0.5 * vel };

    note.gainNode.gain.value = KIT_GAIN * dbToGain(TRIM_DB[pitch] || 0);

    const voice = createVoice(this, ctx, note, start);
    const recipe = RECIPES[pitch];
    if (recipe) recipe(voice, v);

    let total = voice.length();

    // Don't let the same drum overlap itself (optional setting)
    const next = option.nextSameNoteOnInterval;
    if (!this.settings.isSameDrumSoundOverlap && next != -1 && next != null && total > next) total = next;

    voice.stopAll(total);
    this.stopAudioNode(anchor, start + total, note.stopGainNode);
    option.drumStopTime = option.startTime + total;

    const group = CHOKE_GROUP[pitch];
    if (group) chokeEarlier(this, ctx, group, start, start + total, note.gainNode.gain);

    return () => {
        this.stopAudioNode(anchor, 0, note.stopGainNode, true);
        voice.stopNow();
    };
}
