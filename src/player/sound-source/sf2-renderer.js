/**
 * SF2 Renderer (player/sound-source/sf2-renderer.js)
 *
 * Handles all SoundFont 2 playback rendering:
 *  - zone/layer resolution (velocity & key layers, stereo pairs, multiple zones)
 *  - per-layer audio graph: bufferSource -> (filter) -> layerGain -> panner -> stopGain
 *  - sample-accurate loop points, playback rate (incl. scale tuning)
 *  - volume & modulation ADSR envelope scheduling
 *  - vibrato LFO, modulation LFO & modulation-envelope -> pitch/filter
 *  - initial filter cutoff & Q
 *
 * This module is the single place where SF2-specific rendering happens;
 * createNote/createPercussionNote delegate here for soundQuality=4.
 */

import { getSF2Layers, panToPosition } from "./sf2-provider.js";

// Envelope curve sample count for setValueCurveAtTime
const ENV_CURVE_SAMPLES = 64;

/**
 * Compute the playback rate multiplier for a given layer & target pitch.
 * Handles root key, coarse/fine tune, sample correction and scale tuning.
 *
 * NOTE: this must match the classic provider's rate formula so existing
 * samples keep their correct pitch:
 *   rate = 2^((pitch - rootKey + coarseTune + (fineTune + correction)/100) / 12)
 * scaleTuning (SF2 gen 56) scales the per-semitone spacing only when the
 * font explicitly sets it (non-100); default 100 keeps classic behavior.
 */
function computePlaybackRate(pitch, layer) {
    const rootKey = layer.rootKey != null ? layer.rootKey : 60;
    const coarse = layer.coarseTune || 0;
    const fine = layer.fineTune || 0;
    const correction = layer.correction || 0;
    const scaleTuning = layer.scaleTuning != null ? layer.scaleTuning : 100;

    let semitoneOffset;
    if (scaleTuning === 100) {
        // Classic formula — identical to the original provider (per-semitone = 100 cents)
        semitoneOffset = pitch - rootKey + coarse + (fine + correction) / 100;
    } else {
        // Font explicitly sets scale tuning (cents per key)
        semitoneOffset = ((pitch - rootKey) * scaleTuning + coarse * 100 + fine + correction) / 100;
    }
    return Math.pow(2, semitoneOffset / 12);
}

/**
 * Build a Float32Array curve (0..1 envelope level) for the mod-envelope
 * automated sections (pitch/filter). Release section is dropped; callers
 * schedule release with a separate ramp.
 */
function buildEnvelopeCurve(env, duration, peak = 1, samples = ENV_CURVE_SAMPLES) {
    const curve = new Float32Array(samples);
    if (!env || duration <= 0) {
        curve.fill(peak);
        return curve;
    }

    const delay = Math.max(0, env.delay || 0);
    const attack = Math.max(0.001, env.attack || 0.001);
    const hold = Math.max(0, env.hold || 0);
    const decay = Math.max(0.001, env.decay || 0.001);
    const sustain = env.sustain != null ? env.sustain : 1.0;

    const attackEnd = delay + attack;
    const sustainStart = attackEnd + hold + decay;

    for (let i = 0; i < samples; i++) {
        const t = (i / samples) * duration;
        let level;
        if (t < delay) {
            level = 0;
        } else if (t < attackEnd) {
            const p = (t - delay) / attack;
            level = peak * (1 - Math.exp(-4 * p));
        } else if (t < sustainStart) {
            const p = (t - attackEnd) / decay;
            level = sustain + (peak - sustain) * Math.exp(-4 * p);
        } else {
            level = sustain;
        }
        curve[i] = level;
    }
    curve[samples - 1] = sustain;
    return curve;
}

/**
 * Render a complete SF2 note (one or more layers) into the audio graph.
 * Must be called with `this` = PicoAudio instance:
 *   renderSF2Note.call(this, option) -> () => void (stop function) | null
 */
export function renderSF2Note(option) {
    const context = this.context;
    const songStartTime = this.states && this.states.startTime ? this.states.startTime : 0;
    const baseLatency = this.baseLatency || 0;

    const start = option.startTime + songStartTime + baseLatency;
    const stop = option.stopTime + songStartTime + baseLatency;
    const isDrum = option.isDrum === true || option.channel === 9;

    const velocity = Math.round((option.velocity || 1) * 127);

    // Resolve all matched SF2 layers (multi-zone / velocity-layer support)
    const layers = getSF2Layers(option.instrument, option.pitch, velocity, isDrum, option.bank || 0);
    if (!layers || layers.length === 0) return null;

    // Shared stop gain: every layer feeds into this, giving one universal mute.
    const stopGainNode = context.createGain();
    stopGainNode.gain.value = 1;
    if (this.masterGainNode) {
        stopGainNode.connect(this.masterGainNode);
    } else if (context.destination) {
        stopGainNode.connect(context.destination);
    }

    const cleanupFuncs = [];

    const registerCleanup = (fn) => {
        cleanupFuncs.push(fn);
        if (this.pushFunc) {
            this.pushFunc({
                sf2Layer: fn,
                stopFunc: () => { if (typeof fn === 'function') fn(); }
            });
        }
    };

    const safeStopAudioNode = (node, time) => {
        if (!node || typeof node.stop !== 'function') return;
        try {
            node.stop(time);
        } catch (e) {
            // iOS workaround: node.stop() may be called twice; ignore.
            // The shared stopGainNode is NOT muted here so other layers
            // remain unaffected.
        }
    };

    let startedAny = false;
    for (const layer of layers) {
        const ok = buildLayer({
            context,
            layer,
            start,
            stop,
            velocity,
            option,
            songStartTime,
            baseLatency,
            stopGainNode,
            registerCleanup,
            safeStopAudioNode,
        });
        if (ok) startedAny = true;
    }

    if (!startedAny) {
        try { stopGainNode.disconnect(); } catch (e) { /* noop */ }
        return null;
    }

    // Return a universal stop function (also used by createNote's cleanup)
    return () => {
        for (const fn of cleanupFuncs) {
            try { fn(); } catch (e) { /* noop */ }
        }
        try { stopGainNode.gain.setValueAtTime(0, this.context.currentTime); } catch (e) { /* noop */ }
    };
}

/**
 * Build the audio graph for a single layer.
 * Returns true on success, false if the layer could not start.
 */
function buildLayer({
    context,
    layer,
    start,
    stop,
    velocity,
    option,
    songStartTime,
    baseLatency,
    stopGainNode,
    registerCleanup,
    safeStopAudioNode,
}) {
    const buffer = layer.buffer;
    if (!buffer) return false;

    const source = context.createBufferSource();
    source.buffer = buffer;

    // --- playback rate (root key + tune + scale) ---
    const rate = computePlaybackRate(option.pitch, layer);
    source.playbackRate.value = rate;

    // --- sample offset (startAddrs*Offset), relative to buffer start ---
    const headerStart = layer.headerStart || 0;
    const sampleStartFrames = layer.sampleStart != null ? layer.sampleStart : headerStart;
    const offsetFrames = Math.max(0, sampleStartFrames - headerStart);
    const offsetSec = offsetFrames / layer.originalSampleRate;
    const maxOffset = Math.max(0, buffer.duration - 0.001);
    const startOffsetSec = Math.min(offsetSec, maxOffset);

    // --- loop points (absolute frame -> buffer-relative seconds) ---
    // Preserve the font's exact loop length. Some fonts (e.g. Neo1MGM) use
    // micro-loops shorter than 1ms (a single waveform period); forcing a
    // minimum 1ms loop extends the loop past its intended end and changes
    // the sustained pitch (e.g. inst41 A4 rendered at ~354Hz instead of 440Hz).
    const loopStartSec = Math.max(0, (layer.startLoop - headerStart) / layer.originalSampleRate);
    const loopEndRaw = (layer.endLoop - headerStart) / layer.originalSampleRate;
    let loopEndSec = Math.min(loopEndRaw, buffer.duration);
    if (loopEndSec <= loopStartSec) {
        // Degenerate/inverted loop in the font — fall back to the buffer end
        // rather than skipping the loop entirely.
        loopEndSec = buffer.duration;
    }

    const loopMode = layer.loopMode || 0;
    switch (loopMode) {
        case 1: // continuous loop
        case 2: // loop until release (approximated as continuous)
            source.loop = true;
            source.loopStart = loopStartSec;
            source.loopEnd = loopEndSec;
            break;
        default:
            // loopMode 0 (no loop) & 3 (release loop) — play through once
            source.loop = false;
            break;
    }

    // --- pitch bend: schedule playbackRate changes ---
    if (option.pitchBend && option.pitchBend.length) {
        option.pitchBend.forEach((p) => {
            const t = Math.max(0, p.time + songStartTime + baseLatency);
            source.playbackRate.setValueAtTime(
                rate * Math.pow(2, p.value / 12),
                t
            );
        });
    }

    // --- per-layer gain (velocity + SF2 attenuation) ---
    const layerGain = context.createGain();
    const sf2Gain = layer.gain != null ? layer.gain : 1;
    // Velocity response: quadratic (velocity/127)^2, matching the classic
    // PicoAudio velocity² curve. A linear offset would make soft notes too
    // loud; a pure quadratic gives the natural soft→loud progression.
    const velNorm = velocity / 127;
    const velGain = velNorm * velNorm;
    let layerLevel = sf2Gain * velGain;
    // Safety: never let a broken/NaN gain reach the audio graph, and cap a
    // single layer at unity (multi-layer/chord peaks are handled by the
    // master compressor).
    if (!isFinite(layerLevel) || layerLevel < 0) layerLevel = 0;
    if (layerLevel > 1) layerLevel = 1;
    layerGain.gain.value = layerLevel;

    // --- filter ---
    let filter = null;
    const filterFc = layer.filterFc != null ? layer.filterFc : 20000;
    if (filterFc < 20000 && filterFc > 20) {
        filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = Math.min(filterFc, context.sampleRate * 0.45);
        filter.Q.value = layer.filterQ != null ? layer.filterQ : 0.7071;
    }

    // --- pan ---
    const panPos = panToPosition(layer.pan != null ? layer.pan : 64);
    let panner = null;
    let hasPanner = false;
    if (context.createStereoPanner) {
        panner = context.createStereoPanner();
        // Clamp to the StereoPannerNode nominal range [-1, 1]. Some fonts store
        // the pan generator as 0xFFFF (a "not set" marker); panToPosition turns
        // that into ~15.6, which makes Chrome spam out-of-range warnings.
        panner.pan.value = Math.max(-1, Math.min(1, panPos));
        hasPanner = true;
    } else if (context.createPanner) {
        panner = context.createPanner();
        panner.panningModel = 'equalpower';
        const panAngle = Math.max(-1, Math.min(1, panPos)) * 90;
        try {
            if (panner.positionX) {
                panner.positionX.setValueAtTime(Math.sin(panAngle * Math.PI / 180), context.currentTime);
                panner.positionY.setValueAtTime(0, context.currentTime);
                panner.positionZ.setValueAtTime(-Math.cos(panAngle * Math.PI / 180), context.currentTime);
            } else {
                panner.setPosition(Math.sin(panAngle * Math.PI / 180), 0, -Math.cos(panAngle * Math.PI / 180));
            }
        } catch (e) { /* noop */ }
        hasPanner = true;
    }

    // --- audio graph assembly ---
    if (filter) {
        source.connect(filter);
        filter.connect(layerGain);
    } else {
        source.connect(layerGain);
    }
    if (hasPanner) {
        layerGain.connect(panner);
        panner.connect(stopGainNode);
    } else {
        layerGain.connect(stopGainNode);
    }

    // --- vibrato / mod LFO / mod-envelope → detune are intentionally NOT
    // connected. The classic PicoAudio SF2 renderer never modulated detune;
    // doing so made sustained notes audibly slur / detune (e.g. inst 41).
    // Only filter-related modulation is preserved below.

    // --- modulation LFO → filter cutoff only ---
    const mod = layer.modLFO || {};
    const modFilter = mod.toFilterFcCents || 0;
    if (modFilter !== 0 && filter) {
        const modOsc = context.createOscillator();
        modOsc.type = 'sine';
        modOsc.frequency.value = mod.freqHz || 5;
        const g = context.createGain();
        // Approximate cents modulation on the cutoff: derive a per-cents Hz
        // scale at the current cutoff.
        const baseFc = filter.frequency.value;
        const centsToHz = baseFc * (Math.pow(2, Math.abs(modFilter) / 1200) - 1);
        g.gain.value = centsToHz;
        modOsc.connect(g);
        g.connect(filter.frequency);
        const modStart = start + (mod.delay || 0);
        modOsc.start(Math.max(start, modStart));
        safeStopAudioNode(modOsc, stop + 0.05);
        registerCleanup(() => {
            try { modOsc.stop(0); modOsc.disconnect(); } catch (e) { /* noop */ }
        });
    }

    // --- modulation envelope → filter cutoff only ---
    const modEnv = layer.modEnv || {};
    const filterModAmount = layer.filterEnvAmount || 0;

    let hasModEnvAutomation = false;
    if (modEnv.attack > 0 || modEnv.decay > 0 || modEnv.sustain < 1.0) hasModEnvAutomation = true;

    if (hasModEnvAutomation && filterModAmount !== 0 && filter) {
        // Envelope curve duration: from note start until a few seconds in.
        const envDuration = Math.max(0.1, Math.min((stop - start) * 0.25 + 0.25, 2.0));
        const baseFc = filter.frequency.value;
        const curve = buildEnvelopeCurve(modEnv, envDuration, 1);
        const fcCurve = new Float32Array(curve.length);
        for (let i = 0; i < curve.length; i++) {
            fcCurve[i] = baseFc * Math.pow(2, (curve[i] * filterModAmount) / 1200);
        }
        try {
            filter.frequency.setValueCurveAtTime(fcCurve, start, envDuration);
        } catch (e) { /* noop */ }
    }

    // --- volume envelope (ADSR) scheduling ---
    // Peak must be the layer's actual gain (sf2Gain × velGain, already set
    // as .value above) so the ADSR ramps 0 → actual → sustain, instead of
    // hard-clamping to 1.0 which caused severe clipping.
    const env = layer.envelope || {};
    const envPeak = layerGain.gain.value || (sf2Gain * velGain);
    scheduleVolumeEnvelope({
        gainNode: layerGain,
        env,
        start,
        stop,
        peak: envPeak,
    });

    // --- start the source ---
    try {
        source.start(start, startOffsetSec);
    } catch (e) {
        try {
            source.start(start);
        } catch (e2) {
            console.warn('SF2: failed to start source', e2);
            try { source.disconnect(); } catch (e3) { /* noop */ }
            return false;
        }
    }

    // Stop the source after the note ends (release time accounted below).
    const releaseTime = Math.max(0, env.release || 0);
    const stopSourceTime = stop + Math.min(releaseTime, 1.0);
    safeStopAudioNode(source, stopSourceTime);

    return true;
}

/**
 * Schedule a 6-stage volume envelope using exponential segments
 * (SF2-style ADSR). Each stage uses `setTargetAtTime` with a time constant
 * of a quarter of the stage duration — matching the classic PicoAudio SF2
 * renderer, which produced natural exponential decays rather than linear
 * ramps. A shorter time constant makes the exponential reach its target
 * noticeably within the stage, keeping attack punchy and decays smooth.
 *
 * Stages: delay → attack(0→peak) → hold → decay(peak→sustain) → release(→0).
 */
function scheduleVolumeEnvelope({ gainNode, env, start, stop, peak }) {
    const delay = Math.max(0, env.delay || 0);
    const attack = Math.max(0.001, env.attack || 0.001);
    const hold = Math.max(0, env.hold || 0);
    const decay = Math.max(0.001, env.decay || 0.001);
    const sustain = env.sustain != null ? env.sustain : 1.0;
    const release = Math.max(0.001, env.release || 0.001);

    const attackStart = start + delay;

    const param = gainNode.gain;
    param.cancelScheduledValues(0);

    // Per-stage exponential time constants (quarter of the stage length).
    const ATTACK_TC = attack * 0.25;
    const DECAY_TC = decay * 0.25;
    const RELEASE_TC = release * 0.25;

    // Delay: silence until attackStart.
    param.setValueAtTime(0, attackStart);

    // Attack: exponential rise 0 → peak.
    if (attackStart < stop) {
        param.setTargetAtTime(peak, attackStart, ATTACK_TC);
    }

    // Hold then decay: exponential drop peak → sustain, starting at
    // attackEnd + hold (clamped to the note length).
    const attackEnd = Math.min(attackStart + attack, stop);
    const decayStart = Math.min(attackEnd + hold, stop);
    if (decayStart < stop) {
        param.setTargetAtTime(Math.max(0.0001, peak * sustain), decayStart, DECAY_TC);
    }

    // Release: exponential drop to 0 at note-off.
    const releaseStart = stop;
    param.setTargetAtTime(0, releaseStart, RELEASE_TC);
}

export default { renderSF2Note };
