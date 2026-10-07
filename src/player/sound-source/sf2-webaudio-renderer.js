/**
 * SF2 Renderer — Web Audio graph edition (experimental, step 1)
 *
 * Same SoundFont data as the TinySoundFont port (regions, envelopes, filter,
 * pan law and gains all come from tsf-font/tsf-synth), but the synthesis itself
 * is handed to native Web Audio nodes instead of a JavaScript sample loop:
 *
 *   BufferSource (pitch, loop) -> [BiquadFilter] -> envelope gain
 *      -> pan gains (the SF2 sqrt law) -> ChannelMerger -> expression gain
 *
 * The point is main thread cost: the DSP version spends ~1-3ms of JavaScript
 * per note rendering PCM, this one only schedules nodes and automation
 * (tens of microseconds), and the audio thread does the work natively - the
 * same trade the previous Web Audio based renderer made, but now driven by the
 * region/envelope/gain data we validated against TinySoundFont.
 *
 * Known differences to the DSP version (all deliberate, measured by
 * scripts/sf2-engine-ab.mjs):
 *   - resampling is the browser's (windowed sinc) instead of linear
 *   - envelopes are continuous instead of quantised to 64 sample blocks
 *   - mod LFO -> filter cutoff uses a small signal Hz approximation
 */

import { getSF2Font, getSF2PresetIndex } from "./sf2-provider.js";
import {
    noteOnVoices,
} from "../sf2/tsf-synth.js";
import { tsfTimecents2Secs, tsfCents2Hertz, tsfDecibelsToGain } from "../sf2/tsf-font.js";

/** App level trim, same value as the DSP renderer. */
const SF2_OUTPUT_TRIM_DB = -12;
const SF2_OUTPUT_TRIM = Math.pow(10, SF2_OUTPUT_TRIM_DB / 20);
const PICO_GENERATE_VOLUME_REFERENCE = 0.15;

/** TSF's exponential envelope constant (tsf.h: -9.226 / samplesUntilNextSegment). */
const TSF_ENVELOPE_SLOPE = 9.226;
/** Release used when the font asks for none (tsf.h: TSF_FASTRELEASETIME). */
const TSF_FAST_RELEASE = 0.01;

/** Decoded sample slices, per AudioContext (offline contexts are separate). */
const sampleBufferCache = new WeakMap();

function getSampleBuffer(context, font, sampleId) {
    let perContext = sampleBufferCache.get(context);
    if (!perContext) { perContext = new Map(); sampleBufferCache.set(context, perContext); }
    let buffer = perContext.get(sampleId);
    if (buffer) return buffer;

    const shdr = font.shdrs[sampleId];
    const length = Math.max(1, shdr.end - shdr.start);
    buffer = context.createBuffer(1, length, shdr.sampleRate);
    const data = buffer.getChannelData(0);
    const src = font.samples;
    for (let i = 0; i < length; i++) data[i] = src[shdr.start + i] || 0;
    perContext.set(sampleId, buffer);
    return buffer;
}

/**
 * Schedule TSF's volume envelope on a gain parameter.
 *
 * delay -> attack (linear, like tsf's slope) -> hold -> decay (exponential,
 * shortened like tsf does so that it lands on the sustain level) -> release
 * (exponential with the same -9.226 constant as the sample loop).
 *
 * Everything is written as explicit ramps rather than setTargetAtTime: tsf's
 * segments are pure exponentials (level *= exp(-9.226/T) per sample) and an
 * exponentialRamp is exactly that shape, which also keeps the automation
 * deterministic when the note off interrupts a segment.
 */
function scheduleAmpEnvelope(param, env, start, stop, peak) {
    const delay = Math.max(0, env.delay || 0);
    const attack = Math.max(0, env.attack || 0);
    const hold = Math.max(0, env.hold || 0);
    const decay = Math.max(0, env.decay || 0);
    const sustain = Math.max(0, Math.min(1, env.sustain != null ? env.sustain : 1));
    const release = Math.max(TSF_FAST_RELEASE, env.release || TSF_FAST_RELEASE);

    const attackStart = start + delay;
    const attackEnd = attackStart + attack;
    // tsf.h: with a sustain level the decay segment is shortened so the
    // exponential reaches that level exactly (log(sustain) / mysterySlope).
    const decaySpan = (sustain > 0 && sustain < 1) ? decay * (Math.log(sustain) / -TSF_ENVELOPE_SLOPE) : decay;
    const holdEnd = attackEnd + hold;
    const decayEnd = holdEnd + decaySpan;
    // where the exponential decay lands (tsf's segments decay through ~1e-4)
    const decayFloor = sustain > 0 ? sustain : 1e-4;
    const gain = Math.max(peak, 1e-7);

    /** Envelope level (0..1) at time t, for truncating at the note off. */
    const levelAt = (t) => {
        if (t <= attackStart) return 0;
        if (t < attackEnd) return attack > 0 ? (t - attackStart) / attack : 1;
        if (t < holdEnd) return 1;
        if (decaySpan > 0 && t < decayEnd) {
            return decayFloor + (1 - decayFloor) * Math.exp(-TSF_ENVELOPE_SLOPE * ((t - holdEnd) / decaySpan));
        }
        return decayFloor;
    };

    // A ramp is defined between the event before it and its own end time, so a
    // release event placed before the decay ramp's end would silently move that
    // ramp's start - the decay has to be written only up to the note off.
    const releaseStart = Math.max(stop, start);
    const decayEndClamped = Math.min(decayEnd, releaseStart);

    param.cancelScheduledValues(start);
    param.setValueAtTime(0, start);
    if (delay > 0) param.setValueAtTime(0, attackStart);
    if (attack > 0) param.linearRampToValueAtTime(gain, Math.min(attackEnd, releaseStart));
    else param.setValueAtTime(gain, Math.min(attackStart, releaseStart));
    if (hold > 0 && holdEnd < releaseStart) param.setValueAtTime(gain, holdEnd);
    // exponential ramp = tsf's level *= exp(-9.226 / samples) per sample segment
    if (decaySpan > 0 && decayEndClamped > holdEnd) {
        param.exponentialRampToValueAtTime(Math.max(gain * levelAt(decayEndClamped), 1e-6), decayEndClamped);
    }
    // Release: from the level reached at the note off down by the same -9.226
    // factor over `release` seconds (tsf's release segment).
    const releaseLevel = Math.max(levelAt(releaseStart) * gain, 1e-7);
    if (releaseStart > decayEndClamped) param.setValueAtTime(releaseLevel, releaseStart);
    param.exponentialRampToValueAtTime(Math.max(releaseLevel * 1e-4, 1e-7), releaseStart + release);
}

/** Modulation envelope level (0..1) sampled into a curve, like the DSP computes it. */
function buildModEnvCurve(env, duration, samples = 32) {
    const curve = new Float32Array(samples);
    const delay = Math.max(0, env.delay || 0);
    const attack = Math.max(0, env.attack || 0);
    const hold = Math.max(0, env.hold || 0);
    const decay = Math.max(0, env.decay || 0);
    const sustain = Math.max(0, Math.min(1, env.sustain != null ? env.sustain : 1));
    const attackEnd = delay + attack;
    const decayEnd = attackEnd + hold + decay;
    for (let i = 0; i < samples; i++) {
        const t = (i / (samples - 1)) * duration;
        let level;
        if (t <= delay) level = 0;
        else if (t < attackEnd) level = attack > 0 ? (t - delay) / attack : 1;
        else if (t < decayEnd) level = sustain + (1 - sustain) * Math.exp(-TSF_ENVELOPE_SLOPE * ((t - attackEnd) / Math.max(decay, 1e-6)));
        else level = sustain;
        curve[i] = level;
    }
    return curve;
}

/**
 * Render one SF2 note with Web Audio nodes.
 * Must be called with `this` = PicoAudio instance:
 *   renderSF2NoteWebAudio.call(this, option) -> () => void (stop function) | null
 */
export function renderSF2NoteWebAudio(option) {
    const context = this.context;
    const font = getSF2Font();
    if (!font) return null;

    const songStartTime = this.states && this.states.startTime ? this.states.startTime : 0;
    const baseLatency = this.baseLatency || 0;
    const start = option.startTime + songStartTime + baseLatency;
    const stop = option.stopTime + songStartTime + baseLatency;
    const isDrum = option.isDrum === true || option.channel === 9;

    const velocity = Math.max(0, Math.min(127, Math.round(
        Number.isFinite(option.midiVelocity) ? option.midiVelocity
            : (Number.isFinite(option.velocity) ? option.velocity : 1) * 127
    )));
    if (velocity === 0) return null;

    const presetIndex = getSF2PresetIndex(option.instrument, isDrum, option.bank || 0, option.pitch, velocity);
    if (presetIndex < 0) return null;

    const voices = noteOnVoices(font, presetIndex, option.pitch, velocity / 127);
    if (!voices.length) return null;

    const sampleRate = context.sampleRate || 44100;

    // Same output stage as the DSP renderer: user volume, channel volume,
    // ((CC7 * CC11))^3 channel gain and the -12 dB calibration.
    const configuredGenerateVolume = this.settings && Number.isFinite(this.settings.generateVolume)
        ? this.settings.generateVolume
        : PICO_GENERATE_VOLUME_REFERENCE;
    const channel = Number.isInteger(option.channel) ? option.channel : 0;
    const channelVolume = this.channels && this.channels[channel] && this.channels[channel][2] != null
        ? this.channels[channel][2]
        : 1;
    const userGain = Math.max(0, SF2_OUTPUT_TRIM
        * (configuredGenerateVolume / PICO_GENERATE_VOLUME_REFERENCE) * channelVolume);
    const midiVolume = (Number.isFinite(option.midiVolume) ? option.midiVolume : 127) / 127;
    const midiExpression = Number.isFinite(option.midiExpression) ? option.midiExpression : 127;
    const channelGain = (expression01) => Math.pow(midiVolume * expression01, 3);

    const stopGainNode = context.createGain();
    stopGainNode.gain.value = 1;
    if (this.masterGainNode) stopGainNode.connect(this.masterGainNode);
    else if (context.destination) stopGainNode.connect(context.destination);

    const performanceGain = context.createGain();
    const expression = option.expression && option.expression.length ? option.expression : null;
    const initialExpression = expression ? expression[0].value / 127 : midiExpression / 127;
    performanceGain.gain.setValueAtTime(userGain * channelGain(initialExpression), start);
    if (expression) {
        expression.forEach((point) => {
            const time = Math.max(0, point.time + songStartTime + baseLatency);
            performanceGain.gain.setValueAtTime(userGain * channelGain(point.value / 127), time);
        });
    }
    performanceGain.connect(stopGainNode);

    // pitch wheel: tsf applies it as extra semitones on the pitch ratio
    const pitchBends = (option.pitchBend && option.pitchBend.length)
        ? option.pitchBend.map((p) => ({
            time: Math.max(0, p.time + songStartTime + baseLatency),
            semitones: p.value,
        }))
        : null;

    const nodes = [];          // every node of this note, for the stop function
    let startedAny = false;
    let maxEnd = start;
    let activeVoices = 0;
    let noteReleased = false;

    // The note's own gain nodes have to leave the graph when the audio is over:
    // notes that end on their own are only dropped from the player's stop list,
    // their stop function is never called (this is the same leak the DSP
    // renderer had).
    const releaseNoteGraph = () => {
        if (noteReleased) return;
        noteReleased = true;
        try { performanceGain.disconnect(); } catch (e) { /* noop */ }
        try { stopGainNode.disconnect(); } catch (e) { /* noop */ }
    };

    for (const voice of voices) {
        const region = voice.region;
        const shdr = font.shdrs[region.sampleId];
        if (!shdr || !(shdr.sampleRate > 0)) continue;

        // nodes belonging to this voice only, so one voice finishing does not
        // tear down the others (velocity layers, drum voices)
        const voiceNodes = [];

        const buffer = getSampleBuffer(context, font, region.sampleId);
        const source = context.createBufferSource();
        source.buffer = buffer;

        // tsf's ratio already contains sampleRate / outSampleRate because it
        // reads the sample data at the output rate. Web Audio's playbackRate is
        // relative to the *buffer's* own sample rate (it resamples buffer ->
        // context itself), so the sample rate factor has to come back out -
        // otherwise every sample that is not recorded at the context rate plays
        // an octave (or more) off.
        const rate = tsfTimecents2Secs(voice.pitchInputTimecents) * voice.pitchOutputFactor
            * (sampleRate / shdr.sampleRate);
        source.playbackRate.value = rate;
        if (pitchBends) {
            pitchBends.forEach((p) => {
                source.playbackRate.setValueAtTime(rate * Math.pow(2, p.semitones / 12), p.time);
            });
        }

        // loop points are absolute sample frames in the font; tsf loops through
        // the end frame inclusive, Web Audio excludes loopEnd
        if (region.loopMode !== 0 && region.loopStart < region.loopEnd) {
            source.loop = true;
            source.loopStart = Math.max(0, (region.loopStart - shdr.start) / shdr.sampleRate);
            source.loopEnd = Math.min(buffer.duration, (region.loopEnd + 1 - shdr.start) / shdr.sampleRate);
            if (source.loopEnd <= source.loopStart) source.loopEnd = buffer.duration;
        }

        // filter (tsf: cutoff 13500 cents means "no filter")
        let filter = null;
        if (region.initialFilterFc <= 13500) {
            const fc = tsfCents2Hertz(region.initialFilterFc);
            if (fc < sampleRate * 0.499) {
                filter = context.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = fc;
                // tsf's earlevel lowpass peaks at Q = 10^(QdB/20) (0 dB for the
                // default Q), which is exactly what Web Audio's lowpass does
                // when its Q (in dB) equals the generator's decibels.
                filter.Q.value = region.initialFilterQ / 10;
                voiceNodes.push(filter);
            }
        }

        // envelope gain (peak = tsf noteGainDB)
        const level = context.createGain();
        const peak = Math.max(0, tsfDecibelsToGain(voice.noteGainDB));
        scheduleAmpEnvelope(level.gain, voice.ampenv.parameters, start, stop, peak);
        voiceNodes.push(level);

        // pan: tsf's sqrt(0.5 -/+ pan) factors, per channel
        const panL = context.createGain();
        panL.gain.value = voice.panFactorLeft;
        const panR = context.createGain();
        panR.gain.value = voice.panFactorRight;
        const merger = context.createChannelMerger(2);
        voiceNodes.push(panL, panR, merger);

        // channel pan (CC10) moves both factors like tsf_channel_set_pan
        if (option.pan && option.pan.length) {
            option.pan.forEach((p) => {
                const pan01 = (p.value << 7) / 16383;
                const newpan = region.pan + (pan01 - 0.5);
                let left, right;
                if (newpan <= -0.5) { left = 1; right = 0; }
                else if (newpan >= 0.5) { left = 0; right = 1; }
                else { left = Math.sqrt(0.5 - newpan); right = Math.sqrt(0.5 + newpan); }
                const t = Math.max(0, p.time + songStartTime + baseLatency);
                panL.gain.setValueAtTime(left, t);
                panR.gain.setValueAtTime(right, t);
            });
        }

        // modulation envelope -> pitch (cents) and -> filter cutoff (cents -> Hz curve)
        const modEnv = voice.modenv.parameters;
        // the curve covers the whole modulation envelope (its decay included),
        // and the final value is held afterwards - without that hold the filter
        // (or the detune) snaps back to its base value once the curve is over.
        const modEnvSpan = Math.max(0.05,
            Math.max(0, modEnv.delay || 0) + Math.max(0, modEnv.attack || 0)
            + Math.max(0, modEnv.hold || 0) + Math.max(0, modEnv.decay || 0));
        const curveDuration = Math.min(modEnvSpan, 8);
        const modEnvEnd = start + curveDuration;
        const curve = buildModEnvCurve(modEnv, curveDuration);
        const lastLevel = curve[curve.length - 1];
        if (region.modEnvToPitch) {
            const cents = new Float32Array(curve.length);
            for (let i = 0; i < curve.length; i++) cents[i] = curve[i] * region.modEnvToPitch;
            try {
                source.detune.setValueCurveAtTime(cents, start, curveDuration);
                source.detune.setValueAtTime(lastLevel * region.modEnvToPitch, modEnvEnd);
            } catch (e) { /* noop */ }
        }
        if (filter && region.modEnvToFilterFc) {
            const base = filter.frequency.value;
            const hz = new Float32Array(curve.length);
            for (let i = 0; i < curve.length; i++) hz[i] = Math.min(sampleRate * 0.49, base * Math.pow(2, (curve[i] * region.modEnvToFilterFc) / 1200));
            try {
                filter.frequency.setValueCurveAtTime(hz, start, curveDuration);
                filter.frequency.setValueAtTime(hz[hz.length - 1], modEnvEnd);
            } catch (e) { /* noop */ }
        }

        // LFOs -> detune (exact: tsf adds cents) and -> filter (Hz approximation)
        const addLfo = (delay, freqCents, centsTarget, hzTarget) => {
            if (!centsTarget && !hzTarget) return;
            const osc = context.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = 1 / Math.max(0.001, tsfTimecents2Secs(freqCents));
            const gain = context.createGain();
            osc.connect(gain);
            if (centsTarget) { gain.gain.value = centsTarget; gain.connect(source.detune); }
            if (hzTarget && filter) { gain.gain.value = hzTarget; gain.connect(filter.frequency); }
            const lfoStart = start + Math.max(0, delay);
            osc.start(Math.max(lfoStart, context.currentTime));
            osc.stop(stop + 0.05);
            voiceNodes.push(osc, gain);
        };
        const modFilterHz = (filter && region.modLfoToFilterFc)
            ? filter.frequency.value * (Math.pow(2, Math.abs(region.modLfoToFilterFc) / 1200) - 1) : 0;
        addLfo(region.delayModLFO, region.freqModLFO, region.modLfoToPitch, modFilterHz);
        addLfo(region.delayVibLFO, region.freqVibLFO, region.vibLfoToPitch, 0);

        // graph
        let tail = source;
        if (filter) { source.connect(filter); tail = filter; }
        tail.connect(level);
        level.connect(panL);
        level.connect(panR);
        panL.connect(merger, 0, 0);
        panR.connect(merger, 0, 1);
        merger.connect(performanceGain);

        // playback window: start at the region offset, stop after the release
        const offsetSec = Math.max(0, (region.offset - shdr.start) / shdr.sampleRate);
        const amp = voice.ampenv.parameters;
        const release = Math.max(TSF_FAST_RELEASE, amp.release || TSF_FAST_RELEASE);
        // tsf ends the voice when the envelope is done: with no sustain level
        // that is the end of the decay, otherwise the release after note off
        const decayEnd = start + Math.max(0, amp.delay || 0) + Math.max(0, amp.attack || 0)
            + Math.max(0, amp.hold || 0) + Math.max(0, amp.decay || 0);
        const stopSource = (amp.sustain > 0 ? stop + release : Math.min(stop + release, decayEnd)) + 0.05;
        try {
            source.start(Math.max(start, context.currentTime), Math.min(offsetSec, buffer.duration));
            source.stop(stopSource);
        } catch (e) {
            try { source.disconnect(); } catch (e2) { /* noop */ }
            continue;
        }
        // release the graph when the note is over (the player never calls the
        // stop function for notes that end on their own)
        source.onended = () => {
            for (const node of voiceNodes) { try { node.disconnect(); } catch (e) { /* noop */ } }
            voiceNodes.length = 0;
            try { source.disconnect(); } catch (e) { /* noop */ }
            activeVoices--;
            if (activeVoices === 0) releaseNoteGraph();
        };
        activeVoices++;
        nodes.push(...voiceNodes, source);
        maxEnd = Math.max(maxEnd, stopSource);
        startedAny = true;
    }

    if (!startedAny) {
        try { performanceGain.disconnect(); stopGainNode.disconnect(); } catch (e) { /* noop */ }
        return null;
    }

    return () => {
        try { stopGainNode.gain.setValueAtTime(0, context.currentTime); } catch (e) { /* noop */ }
        for (const node of nodes) {
            try { if (typeof node.stop === 'function') node.stop(); } catch (e) { /* noop */ }
            try { node.disconnect(); } catch (e) { /* noop */ }
        }
        nodes.length = 0;
        releaseNoteGraph();
    };
}

export default { renderSF2NoteWebAudio };
