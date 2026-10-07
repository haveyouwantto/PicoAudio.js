/**
 * TinySoundFont — voice rendering (JavaScript port)
 *
 * Direct port of the synthesizer half of tsf.h:
 *   https://github.com/schellingb/TinySoundFont
 * TinySoundFont is MIT licensed, Copyright (C) 2017-2025 Bernhard Schelling,
 * based on SFZero, Copyright (C) 2012 Steve Folta.
 *
 * The signal path is upstream's, unchanged: linear interpolated sample
 * playback, SF2 six stage envelopes (exponential decay/release via the
 * LinuxSampler style constant), one biquad lowpass with the region's Q, and
 * the modulation / vibrato LFOs. C `float` locals are kept as Math.fround
 * where they carry state, so the port tracks the reference numerically.
 */

import {
    TSF_LOOPMODE_SUSTAIN,
    tsfTimecents2Secs,
    tsfCents2Hertz,
    tsfDecibelsToGain,
    tsfGainToDecibels,
} from './tsf-font.js';

export const TSF_RENDER_EFFECTSAMPLEBLOCK = 64;
const TSF_FASTRELEASETIME = 0.01;


/**
 * Sample interpolation modes.
 *
 * TSF itself only has the linear one (tsf.h: "Simple linear interpolation"),
 * so LINEAR is the reference behaviour and the default. The other two are
 * opt-in trade-offs for the app:
 *   - NEAREST: one sample fetch, no multiply/add, audibly grainier (aliasing
 *     and a slight high frequency loss when pitching up).
 *   - CUBIC: 4 point Catmull-Rom, smoother than linear at the cost of a few
 *     more multiplies per sample.
 */
export const TSF_INTERP_NEAREST = 0;
export const TSF_INTERP_LINEAR = 1;
export const TSF_INTERP_CUBIC = 2;

/** Map a settings string ('nearest' | 'linear' | 'cubic') to a mode constant. */
export function resolveInterpolation(mode) {
    if (typeof mode === 'number') return mode;
    switch (String(mode == null ? '' : mode).toLowerCase()) {
    case 'nearest': case 'neighbor': case 'neighbour': case 'point': case 'off': return TSF_INTERP_NEAREST;
    case 'cubic': case 'hermite': case 'catmull-rom': case 'catmullrom': case 'high': return TSF_INTERP_CUBIC;
    default: return TSF_INTERP_LINEAR;
    }
}

const TSF_SEGMENT_NONE = 0;
const TSF_SEGMENT_DELAY = 1;
const TSF_SEGMENT_ATTACK = 2;
const TSF_SEGMENT_HOLD = 3;
const TSF_SEGMENT_DECAY = 4;
const TSF_SEGMENT_SUSTAIN = 5;
const TSF_SEGMENT_RELEASE = 6;
const TSF_SEGMENT_DONE = 7;

const f32 = Math.fround;

/* ------------------------------------------------------------------ EG -- */

function envelopeReleaseSamples(e, outSampleRate) {
    return Math.trunc((e.parameters.release <= 0 ? TSF_FASTRELEASETIME : e.parameters.release) * outSampleRate);
}

function envelopeNextSegment(e, activeSegment, outSampleRate) {
    switch (activeSegment) {
    case TSF_SEGMENT_NONE:
        e.samplesUntilNextSegment = Math.trunc(e.parameters.delay * outSampleRate);
        if (e.samplesUntilNextSegment > 0) {
            e.segment = TSF_SEGMENT_DELAY;
            e.segmentIsExponential = false;
            e.level = 0.0;
            e.slope = 0.0;
            return;
        }
        /* fall through */
    case TSF_SEGMENT_DELAY:
        e.samplesUntilNextSegment = Math.trunc(e.parameters.attack * outSampleRate);
        if (e.samplesUntilNextSegment > 0) {
            if (!e.isAmpEnv) {
                // Mod env attack duration scales with velocity.
                e.samplesUntilNextSegment = Math.trunc(e.parameters.attack * ((145 - e.midiVelocity) / 144.0) * outSampleRate);
            }
            e.segment = TSF_SEGMENT_ATTACK;
            e.segmentIsExponential = false;
            e.level = 0.0;
            e.slope = 1.0 / e.samplesUntilNextSegment;
            return;
        }
        /* fall through */
    case TSF_SEGMENT_ATTACK:
        e.samplesUntilNextSegment = Math.trunc(e.parameters.hold * outSampleRate);
        if (e.samplesUntilNextSegment > 0) {
            e.segment = TSF_SEGMENT_HOLD;
            e.segmentIsExponential = false;
            e.level = 1.0;
            e.slope = 0.0;
            return;
        }
        /* fall through */
    case TSF_SEGMENT_HOLD:
        e.samplesUntilNextSegment = Math.trunc(e.parameters.decay * outSampleRate);
        if (e.samplesUntilNextSegment > 0) {
            e.segment = TSF_SEGMENT_DECAY;
            e.level = 1.0;
            if (e.isAmpEnv) {
                // Following LinuxSampler: decay is the time to fall to zero,
                // not the time to reach the sustain level.
                const mysterySlope = -9.226 / e.samplesUntilNextSegment;
                e.slope = f32(Math.exp(mysterySlope));
                e.segmentIsExponential = true;
                if (e.parameters.sustain > 0.0) {
                    e.samplesUntilNextSegment = Math.trunc(Math.log(e.parameters.sustain) / mysterySlope);
                }
            } else {
                e.slope = -1.0 / e.samplesUntilNextSegment;
                e.samplesUntilNextSegment = Math.trunc(e.parameters.decay * (1.0 - e.parameters.sustain) * outSampleRate);
                e.segmentIsExponential = false;
            }
            return;
        }
        /* fall through */
    case TSF_SEGMENT_DECAY:
        e.segment = TSF_SEGMENT_SUSTAIN;
        e.level = e.parameters.sustain;
        e.slope = 0.0;
        e.samplesUntilNextSegment = 0x7fffffff;
        e.segmentIsExponential = false;
        return;
    case TSF_SEGMENT_SUSTAIN:
        e.segment = TSF_SEGMENT_RELEASE;
        e.samplesUntilNextSegment = envelopeReleaseSamples(e, outSampleRate);
        if (e.isAmpEnv) {
            const mysterySlope = -9.226 / e.samplesUntilNextSegment;
            e.slope = f32(Math.exp(mysterySlope));
            e.segmentIsExponential = true;
        } else {
            e.slope = -e.level / e.samplesUntilNextSegment;
            e.segmentIsExponential = false;
        }
        return;
    case TSF_SEGMENT_RELEASE:
    default:
        e.segment = TSF_SEGMENT_DONE;
        e.segmentIsExponential = false;
        e.level = e.slope = 0.0;
        e.samplesUntilNextSegment = 0x7ffffff;
    }
}

function envelopeSetup(e, newParameters, midiNoteNumber, midiVelocity, isAmpEnv, outSampleRate) {
    e.parameters = { ...newParameters };
    if (e.parameters.keynumToHold) {
        e.parameters.hold += e.parameters.keynumToHold * (60.0 - midiNoteNumber);
        e.parameters.hold = (e.parameters.hold < -10000.0 ? 0.0 : tsfTimecents2Secs(e.parameters.hold));
    }
    if (e.parameters.keynumToDecay) {
        e.parameters.decay += e.parameters.keynumToDecay * (60.0 - midiNoteNumber);
        e.parameters.decay = (e.parameters.decay < -10000.0 ? 0.0 : tsfTimecents2Secs(e.parameters.decay));
    }
    e.midiVelocity = midiVelocity;
    e.isAmpEnv = isAmpEnv;
    envelopeNextSegment(e, TSF_SEGMENT_NONE, outSampleRate);
}

function envelopeProcess(e, numSamples, outSampleRate) {
    if (e.slope) {
        if (e.segmentIsExponential) e.level = f32(e.level * Math.pow(e.slope, numSamples));
        else e.level = f32(e.level + (e.slope * numSamples));
    }
    e.samplesUntilNextSegment -= numSamples;
    if (e.samplesUntilNextSegment <= 0) envelopeNextSegment(e, e.segment, outSampleRate);
}

/* ------------------------------------------------------------- lowpass -- */

function lowpassSetup(e, Fc) {
    // Biquad lowpass, same coefficients as tsf_voice_lowpass_setup.
    const K = Math.tan(Math.PI * Fc), KK = K * K;
    const norm = 1 / (1 + K * e.QInv + KK);
    e.a0 = KK * norm;
    e.a1 = 2 * e.a0;
    e.b1 = 2 * (KK - 1) * norm;
    e.b2 = (1 - K * e.QInv + KK) * norm;
}

function lowpassProcess(e, In) {
    const Out = In * e.a0 + e.z1;
    e.z1 = In * e.a1 + e.z2 - e.b1 * Out;
    e.z2 = In * e.a0 - e.b2 * Out;
    // C returns (float)Out here, but the value is only ever consumed by a
    // multiply that lands in a Float32Array, so rounding it is below one ulp
    // of the stored sample while Math.fround in the per sample path costs
    // 8-14% of the whole render (measured). The filter state stays double,
    // exactly like struct tsf_voice_lowpass.
    return Out;
}

/* ----------------------------------------------------------------- LFO -- */

function lfoSetup(e, delay, freqCents, outSampleRate) {
    e.samplesUntil = Math.trunc(delay * outSampleRate);
    e.delta = 4.0 * tsfCents2Hertz(freqCents) / outSampleRate;
    e.level = 0;
}

function lfoProcess(e, blockSamples) {
    if (e.samplesUntil > blockSamples) { e.samplesUntil -= blockSamples; return; }
    e.level = f32(e.level + e.delta * blockSamples);
    if (e.level > 1.0) { e.delta = -e.delta; e.level = 2.0 - e.level; }
    else if (e.level < -1.0) { e.delta = -e.delta; e.level = -2.0 - e.level; }
}

/* --------------------------------------------------------------- voice -- */

function calcPitchRatio(v, pitchShift, outSampleRate) {
    const region = v.region;
    const note = v.playingKey + region.transpose + region.tune / 100.0;
    let adjustedPitch = region.pitchKeycenter + (note - region.pitchKeycenter) * (region.pitchKeytrack / 100.0);
    if (pitchShift) adjustedPitch += pitchShift;
    v.pitchInputTimecents = adjustedPitch * 100.0;
    v.pitchOutputFactor = region.sampleRate / (tsfTimecents2Secs(region.pitchKeycenter * 100.0) * outSampleRate);
}

/**
 * tsf_channel_set_pan for one voice: the channel pan (0..1, 0.5 = center) is
 * an offset added to the region pan, then the 3 dB pan law is re-applied.
 */
function applyChannelPan(v, pan) {
    const newpan = v.region.pan + (pan - 0.5);
    if (newpan <= -0.5) { v.panFactorLeft = 1.0; v.panFactorRight = 0.0; }
    else if (newpan >= 0.5) { v.panFactorLeft = 0.0; v.panFactorRight = 1.0; }
    else {
        v.panFactorLeft = f32(Math.sqrt(0.5 - newpan));
        v.panFactorRight = f32(Math.sqrt(0.5 + newpan));
    }
}

/** tsf_note_on: one voice per matching region (this port renders a note alone). */
export function noteOnVoices(font, presetIndex, key, vel) {
    const voices = [];
    const midiVelocity = Math.trunc(vel * 127);

    if (presetIndex < 0 || presetIndex >= font.presets.length) return voices;
    if (!(vel > 0)) return voices;

    for (const region of font.presets[presetIndex].regions) {
        if (key < region.lokey || key > region.hikey ||
            midiVelocity < region.lovel || midiVelocity > region.hivel) continue;

        const voice = {
            playingPreset: presetIndex,
            playingKey: key,
            region,
            noteGainDB: f32(font.globalGainDB - region.attenuation - tsfGainToDecibels(1.0 / vel)),
            pitchInputTimecents: 0,
            pitchOutputFactor: 0,
            sourceSamplePosition: 0,
            panFactorLeft: 0,
            panFactorRight: 0,
            loopStart: 0,
            loopEnd: 0,
            ampenv: newEnvelopeState(),
            modenv: newEnvelopeState(),
            lowpass: { QInv: 0, a0: 0, a1: 0, b1: 0, b2: 0, z1: 0, z2: 0, active: false },
            modlfo: { samplesUntil: 0, level: 0, delta: 0 },
            viblfo: { samplesUntil: 0, level: 0, delta: 0 },
        };

        calcPitchRatio(voice, 0, font.outSampleRate);
        // 3 dB pan law, matching the reference (sqrt curve).
        voice.panFactorLeft = f32(Math.sqrt(0.5 - region.pan));
        voice.panFactorRight = f32(Math.sqrt(0.5 + region.pan));

        voice.sourceSamplePosition = region.offset;

        const doLoop = (region.loopMode !== 0 && region.loopStart < region.loopEnd);
        voice.loopStart = (doLoop ? region.loopStart : 0);
        voice.loopEnd = (doLoop ? region.loopEnd : 0);

        envelopeSetup(voice.ampenv, region.ampEnv, key, midiVelocity, true, font.outSampleRate);
        envelopeSetup(voice.modenv, region.modEnv, key, midiVelocity, false, font.outSampleRate);

        const lowpassFc = (region.initialFilterFc <= 13500
            ? tsfCents2Hertz(region.initialFilterFc) / font.outSampleRate : 1.0);
        const lowpassFilterQDB = region.initialFilterQ / 10.0;
        voice.lowpass.QInv = 1.0 / Math.pow(10.0, (lowpassFilterQDB / 20.0));
        voice.lowpass.z1 = 0;
        voice.lowpass.z2 = 0;
        voice.lowpass.active = (lowpassFc < 0.499);
        if (voice.lowpass.active) lowpassSetup(voice.lowpass, lowpassFc);

        lfoSetup(voice.modlfo, region.delayModLFO, region.freqModLFO, font.outSampleRate);
        lfoSetup(voice.viblfo, region.delayVibLFO, region.freqVibLFO, font.outSampleRate);

        voices.push(voice);
    }
    return voices;
}

function newEnvelopeState() {
    return {
        segment: 0,
        segmentIsExponential: false,
        isAmpEnv: false,
        midiVelocity: 0,
        level: 0,
        slope: 0,
        samplesUntilNextSegment: 0,
        parameters: { delay: 0, attack: 0, hold: 0, decay: 0, sustain: 0, release: 0, keynumToHold: 0, keynumToDecay: 0 },
    };
}

/** tsf_voice_end */
function voiceEnd(font, v) {
    envelopeNextSegment(v.ampenv, TSF_SEGMENT_SUSTAIN, font.outSampleRate);
    envelopeNextSegment(v.modenv, TSF_SEGMENT_SUSTAIN, font.outSampleRate);
    if (v.region.loopMode === TSF_LOOPMODE_SUSTAIN) {
        // Continue playing, but stop looping.
        v.loopEnd = v.loopStart;
    }
}

/** tsf_note_off for the voices of one note. */
export function noteOffVoices(font, voices, presetIndex, key) {
    for (const v of voices) {
        if (v.playingPreset !== presetIndex || v.playingKey !== key || v.ampenv.segment >= TSF_SEGMENT_RELEASE) continue;
        voiceEnd(font, v);
    }
}

/** tsf_voice_render, interleaved stereo only: adds into `out` at frame `offset`. */
function voiceRender(font, v, out, offset, numSamples, interp) {
    const region = v.region;
    const input = font.samples;
    let outIdx = offset * 2;

    const updateModEnv = !!(region.modEnvToPitch || region.modEnvToFilterFc);
    const updateModLFO = !!(v.modlfo.delta && (region.modLfoToPitch || region.modLfoToFilterFc || region.modLfoToVolume));
    const updateVibLFO = !!(v.viblfo.delta && region.vibLfoToPitch);
    const isLooping = (v.loopStart < v.loopEnd);
    const tmpLoopStart = v.loopStart, tmpLoopEnd = v.loopEnd;
    const tmpSampleEndDbl = region.end;
    const tmpLoopEndDbl = tmpLoopEnd + 1.0;
    let tmpSourceSamplePosition = v.sourceSamplePosition;
    const tmpLowpass = { ...v.lowpass };

    const dynamicLowpass = !!(region.modLfoToFilterFc || region.modEnvToFilterFc);
    const tmpSampleRate = font.outSampleRate;
    let tmpInitialFilterFc = 0, tmpModLfoToFilterFc = 0, tmpModEnvToFilterFc = 0;
    const dynamicPitchRatio = !!(region.modLfoToPitch || region.modEnvToPitch || region.vibLfoToPitch);
    let pitchRatio = 0, tmpModLfoToPitch = 0, tmpVibLfoToPitch = 0, tmpModEnvToPitch = 0;
    const dynamicGain = (region.modLfoToVolume !== 0);
    let noteGain = 0, tmpModLfoToVolume = 0;

    if (dynamicLowpass) {
        tmpInitialFilterFc = region.initialFilterFc;
        tmpModLfoToFilterFc = region.modLfoToFilterFc;
        tmpModEnvToFilterFc = region.modEnvToFilterFc;
    }
    if (dynamicPitchRatio) {
        pitchRatio = 0;
        tmpModLfoToPitch = region.modLfoToPitch;
        tmpVibLfoToPitch = region.vibLfoToPitch;
        tmpModEnvToPitch = region.modEnvToPitch;
    } else {
        pitchRatio = tsfTimecents2Secs(v.pitchInputTimecents) * v.pitchOutputFactor;
    }
    if (dynamicGain) {
        tmpModLfoToVolume = region.modLfoToVolume * 0.1;
    } else {
        noteGain = tsfDecibelsToGain(v.noteGainDB);
    }

    while (numSamples > 0) {
        let blockSamples = (numSamples > TSF_RENDER_EFFECTSAMPLEBLOCK ? TSF_RENDER_EFFECTSAMPLEBLOCK : numSamples);
        numSamples -= blockSamples;

        if (dynamicLowpass) {
            const fres = tmpInitialFilterFc + v.modlfo.level * tmpModLfoToFilterFc + v.modenv.level * tmpModEnvToFilterFc;
            const lowpassFc = (fres <= 13500 ? tsfCents2Hertz(fres) / tmpSampleRate : 1.0);
            tmpLowpass.active = (lowpassFc < 0.499);
            if (tmpLowpass.active) lowpassSetup(tmpLowpass, lowpassFc);
        }

        if (dynamicPitchRatio) {
            pitchRatio = tsfTimecents2Secs(
                v.pitchInputTimecents + (v.modlfo.level * tmpModLfoToPitch
                    + v.viblfo.level * tmpVibLfoToPitch
                    + v.modenv.level * tmpModEnvToPitch)
            ) * v.pitchOutputFactor;
        }

        if (dynamicGain) {
            noteGain = tsfDecibelsToGain(v.noteGainDB + (v.modlfo.level * tmpModLfoToVolume));
        }

        const gainMono = f32(noteGain * v.ampenv.level);

        // Update EG.
        envelopeProcess(v.ampenv, blockSamples, tmpSampleRate);
        if (updateModEnv) envelopeProcess(v.modenv, blockSamples, tmpSampleRate);

        // Update LFOs.
        if (updateModLFO) lfoProcess(v.modlfo, blockSamples);
        if (updateVibLFO) lfoProcess(v.viblfo, blockSamples);

        const gainLeft = f32(gainMono * v.panFactorLeft);
        const gainRight = f32(gainMono * v.panFactorRight);

        // The sample loop is duplicated per interpolation mode so the hot path
        // stays branch free; only one of the three ever runs.
        if (interp === TSF_INTERP_NEAREST) {
            while (blockSamples-- > 0 && tmpSourceSamplePosition < tmpSampleEndDbl) {
                let val = input[Math.trunc(tmpSourceSamplePosition)];

                if (tmpLowpass.active) val = lowpassProcess(tmpLowpass, val);

                out[outIdx++] += val * gainLeft;
                out[outIdx++] += val * gainRight;

                tmpSourceSamplePosition += pitchRatio;
                if (tmpSourceSamplePosition >= tmpLoopEndDbl && isLooping) {
                    tmpSourceSamplePosition -= (tmpLoopEnd - tmpLoopStart + 1.0);
                }
            }
        } else if (interp === TSF_INTERP_CUBIC) {
            const loopLen = tmpLoopEnd - tmpLoopStart + 1.0;
            const lastSample = tmpSampleEndDbl - 1;
            while (blockSamples-- > 0 && tmpSourceSamplePosition < tmpSampleEndDbl) {
                const pos = Math.trunc(tmpSourceSamplePosition);
                // Neighbours, wrapped into the loop when the font loops.
                const i1 = pos;
                let i2 = (isLooping && pos + 1 > tmpLoopEnd ? pos + 1 - loopLen : pos + 1);
                let i0 = pos - 1;
                let i3 = pos + 2;
                if (isLooping) {
                    if (pos === tmpLoopStart) i0 = tmpLoopEnd;
                    if (i3 > tmpLoopEnd) i3 -= loopLen;
                }
                if (i0 < 0) i0 = 0;
                if (i2 > lastSample) i2 = lastSample;
                if (i3 > lastSample) i3 = lastSample;

                // Catmull-Rom.
                const alpha = f32(tmpSourceSamplePosition - pos);
                const y0 = input[i0], y1 = input[i1], y2 = input[i2], y3 = input[i3];
                let val = 0.5 * ((2 * y1)
                    + (-y0 + y2) * alpha
                    + (2 * y0 - 5 * y1 + 4 * y2 - y3) * alpha * alpha
                    + (-y0 + 3 * y1 - 3 * y2 + y3) * alpha * alpha * alpha);

                // Low-pass filter.
                if (tmpLowpass.active) val = lowpassProcess(tmpLowpass, val);
                val = f32(val);

                out[outIdx++] += val * gainLeft;
                out[outIdx++] += val * gainRight;

                tmpSourceSamplePosition += pitchRatio;
                if (tmpSourceSamplePosition >= tmpLoopEndDbl && isLooping) {
                    tmpSourceSamplePosition -= loopLen;
                }
            }
        } else {
            while (blockSamples-- > 0 && tmpSourceSamplePosition < tmpSampleEndDbl) {
                const pos = Math.trunc(tmpSourceSamplePosition);
                const nextPos = (pos >= tmpLoopEnd && isLooping ? tmpLoopStart : pos + 1);

                // Simple linear interpolation (identical to tsf.h). The C code
                // keeps alpha/val in float; doing this in double and rounding
                // once into the output buffer measures the same against the
                // reference (worst case 2.5e-6) and renders 8-14% faster.
                const alpha = (tmpSourceSamplePosition - pos);
                let val = (input[pos] * (1.0 - alpha) + input[nextPos] * alpha);

                // Low-pass filter.
                if (tmpLowpass.active) val = lowpassProcess(tmpLowpass, val);

                out[outIdx++] += val * gainLeft;
                out[outIdx++] += val * gainRight;

                // Next sample.
                tmpSourceSamplePosition += pitchRatio;
                if (tmpSourceSamplePosition >= tmpLoopEndDbl && isLooping) {
                    tmpSourceSamplePosition -= (tmpLoopEnd - tmpLoopStart + 1.0);
                }
            }
        }

        if (tmpSourceSamplePosition >= tmpSampleEndDbl || v.ampenv.segment === TSF_SEGMENT_DONE) {
            v.playingPreset = -1;
            return;
        }
    }

    v.sourceSamplePosition = tmpSourceSamplePosition;
    if (tmpLowpass.active || dynamicLowpass) v.lowpass = tmpLowpass;
}

/**
 * Create a stateful note renderer.
 *
 * Mirrors `tsf_note_on` + `tsf_note_off` + `tsf_render_float` with the note
 * started at frame 0 and released after `noteOffFrames`, but lets the caller
 * pull the audio in pieces: `render(frames)` produces the next slice, so a
 * long note can be synthesized while it plays instead of in one blocking go.
 *
 * `pitchBends` are {frame, value} pairs (value in semitones). They are applied
 * to the voices at block boundaries, which is how TSF applies channel pitch
 * wheel changes (tsf_channel_applypitch -> tsf_voice_calcpitchratio).
 *
 * @returns {{render: (frames:number, target?:Float32Array) => number,
 *            isDone: () => boolean, buffer: Float32Array, frames: number}}
 */
export function createNoteRenderer(font, presetIndex, key, vel, noteOffFrames, maxFrames, pitchBends, panChanges, interpolation) {
    const interp = resolveInterpolation(interpolation);
    const voices = noteOnVoices(font, presetIndex, key, vel);

    // NOTE: a pre-sized buffer was measured here and made whole songs slower:
    // most notes are short (drums, plucks) so a tight "note length + release"
    // estimate over-allocates and the extra zero fill costs more than the
    // reallocations it saves. Keep the small seed plus geometric growth.
    let out = new Float32Array(8192 * 2);
    let written = 0;
    let released = false;
    let bendIndex = 0;
    let panIndex = 0;

    const anyAlive = () => {
        for (const v of voices) { if (v.playingPreset !== -1) return true; }
        return false;
    };

    return {
        /** Total frames rendered so far. */
        get frames() { return written; },
        /** Internal buffer (only grows when rendering without a target). */
        get buffer() { return out; },
        /** True once every voice has finished or the frame cap was reached. */
        isDone() { return !anyAlive() || written >= maxFrames; },

        /**
         * Render up to `frames` more frames.
         *
         * With `target` the slice is written into it starting at index 0 and
         * the internal buffer is left alone, which is what streaming playback
         * uses. Without it the slice is appended to the internal buffer, which
         * is what the one shot renderNote() wrapper uses.
         *
         * @returns {number} frames written by this call
         */
        render(frames, target) {
            const startWritten = written;
            const remaining = maxFrames - written;
            let want = Math.min(frames, remaining);

            // TSF's envelopes advance once per TSF_RENDER_EFFECTSAMPLEBLOCK
            // samples, so the block boundaries have to line up with a one shot
            // render or the gain steps land on different samples. Aligning the
            // chunk length keeps chunked output bit identical to whole note
            // rendering (a final partial chunk is left as it is).
            if (want >= TSF_RENDER_EFFECTSAMPLEBLOCK && want < remaining) {
                want -= want % TSF_RENDER_EFFECTSAMPLEBLOCK;
            }
            const limit = written + want;

            // Voice rendering accumulates into the buffer, so a reused target
            // (streaming) has to be cleared first - the internal buffer is
            // zero filled once and only ever appended to.
            if (target) target.fill(0, 0, (limit - written) * 2);

            while (written < limit) {
                if (!anyAlive()) break;

                while (pitchBends && bendIndex < pitchBends.length && pitchBends[bendIndex].frame <= written) {
                    const semitones = pitchBends[bendIndex].value;
                    for (const v of voices) {
                        if (v.playingPreset !== -1) calcPitchRatio(v, semitones, font.outSampleRate);
                    }
                    bendIndex++;
                }

                while (panChanges && panIndex < panChanges.length && panChanges[panIndex].frame <= written) {
                    const pan = panChanges[panIndex].value;
                    for (const v of voices) {
                        if (v.playingPreset !== -1) applyChannelPan(v, pan);
                    }
                    panIndex++;
                }

                if (!released && written >= noteOffFrames) {
                    noteOffVoices(font, voices, presetIndex, key);
                    released = true;
                }

                const block = Math.min(TSF_RENDER_EFFECTSAMPLEBLOCK, limit - written);
                if (!target && (written + block) * 2 > out.length) {
                    const grown = new Float32Array(Math.max(out.length * 2, (written + block) * 2));
                    grown.set(out.subarray(0, written * 2));
                    out = grown;
                }
                // taken after the possible growth, so the block lands in the
                // buffer that is actually big enough for it
                const outBuffer = target || out;
                const offset = target ? written - startWritten : written;
                for (const v of voices) {
                    if (v.playingPreset !== -1) voiceRender(font, v, outBuffer, offset, block, interp);
                }
                written += block;
            }

            return written - startWritten;
        },
    };
}

/**
 * Render one whole note into an interleaved stereo float32 buffer.
 *
 * Convenience wrapper around createNoteRenderer() for offline use (analysis
 * scripts, offline audio rendering).
 *
 * @returns {{data: Float32Array, frames: number}} interleaved LR samples
 */
export function renderNote(font, presetIndex, key, vel, noteOffFrames, maxFrames, pitchBends, panChanges, interpolation) {
    const renderer = createNoteRenderer(
        font, presetIndex, key, vel, noteOffFrames, maxFrames, pitchBends, panChanges, interpolation);
    renderer.render(maxFrames);
    return { data: renderer.buffer.subarray(0, renderer.frames * 2), frames: renderer.frames };
}

export default {
    renderNote,
    createNoteRenderer,
    noteOnVoices,
    noteOffVoices,
    resolveInterpolation,
    TSF_INTERP_NEAREST,
    TSF_INTERP_LINEAR,
    TSF_INTERP_CUBIC,
};
