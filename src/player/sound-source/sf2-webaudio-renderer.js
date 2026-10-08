/**
 * SF2 Renderer — Web Audio graph edition
 *
 * Same SoundFont data as the TinySoundFont port (regions, envelopes, filter,
 * pan law and gains all come from tsf-font/tsf-synth), but the synthesis is
 * handed to native Web Audio nodes instead of a JavaScript sample loop:
 *
 *   BufferSource (pitch, loop) -> [BiquadFilter] -> [volume LFO]
 *      -> pan gains, each carrying the amplitude envelope
 *      -> ChannelMerger -> expression / channel gain -> master
 *
 * The point is main thread cost: the DSP version spends milliseconds of
 * JavaScript per note synthesising PCM, this one only schedules nodes and
 * automation (a fraction of that), and the audio thread does the work.
 *
 * Keeping the output *equal* to the DSP version is the hard part, so every
 * piece of the graph mirrors tsf.h exactly:
 *   - the amplitude envelope is written as tsf's segments (linear attack,
 *     hold, exponential decay shortened to the sustain level, exponential
 *     release with the same -9.226 constant), and a note off always gets an
 *     explicit value event so a long hold cannot silently become a decay
 *   - the modulation envelope is piecewise *linear* in cents (tsf's mod env
 *     has a linear attack/decay and a linear release to zero), written as
 *     ramps - not as a sampled curve, which quantised fast segments
 *   - mod env / LFO to pitch and cutoff drive AudioParams that already take
 *     cents (source.detune, filter.detune), so no Hz approximation is needed
 *   - the LFO rate generator is a rate in cents relative to 8.176 Hz
 *     (tsf_cents2hertz), not a period in timecents
 *   - mod LFO to volume becomes an exponential (wave-shaper) gain factor,
 *     matching tsf's decibelsToGain(noteGainDB + level * amount)
 *   - a filter that tsf would bypass (cutoff generator >= 13500 cents, or a
 *     cutoff at/above 0.499 of the sample rate) is left out of the graph
 *   - the pan law is tsf's sqrt(0.5 -/+ pan) per channel
 *
 * Known differences that remain (measurable with scripts/sf2-program-sweep.mjs
 * and scripts/browser-bench.mjs): resampling is the browser's rather than
 * linear, and the filter is a biquad of the same order but with Chrome's own
 * coefficient handling near the cutoff.
 */

import { getSF2Font, getSF2PresetIndex } from "./sf2-provider.js";
import { noteOnVoices, tsfQuality } from "../sf2/tsf-synth.js";
import { tsfCents2Hertz, tsfDecibelsToGain } from "../sf2/tsf-font.js";
import { resolveSF2Quality, applySF2Quality } from "../sf2/sf2-quality.js";
import { noteDropped } from "../../util/note-debug.js";

/** App level trim, same value as the DSP renderer. */
const SF2_OUTPUT_TRIM_DB = -12;
const SF2_OUTPUT_TRIM = Math.pow(10, SF2_OUTPUT_TRIM_DB / 20);
const PICO_GENERATE_VOLUME_REFERENCE = 0.15;

/** TSF's exponential envelope constant (tsf.h: -9.226 / samplesUntilNextSegment). */
const TSF_ENVELOPE_SLOPE = 9.226;
/** Release used when the font asks for none (tsf.h: TSF_FASTRELEASETIME). */
const TSF_FAST_RELEASE = 0.01;
/** tsf.h: a cutoff generator at or above this is the "no filter" default. */
const TSF_FILTER_BYPASS_CENTS = 13500;
/** tsf.h: the lowpass only runs below 0.499 of the output sample rate. */
const TSF_MAX_FILTER_RATIO = 0.499;
/** Gain floors only guard the exponential ramps; both are far below audibility. */
const GAIN_FLOOR = 1e-9;

/**
 * Decoded sample slices, per AudioContext (offline contexts are separate).
 *
 * The entry remembers which font it was built from: the app keeps one
 * AudioContext for playback and simply loads the next SoundFont into it, so a
 * cache keyed by the context alone kept handing out the *previous* font's
 * samples to the new font's regions - every instrument came out wrong until
 * the page was reloaded. (The DSP renderer reads the font directly, which is
 * why it was unaffected.)
 */
const sampleBufferCache = new WeakMap();

function getSampleBuffer(context, font, sampleId) {
    let entry = sampleBufferCache.get(context);
    if (!entry || entry.font !== font) {
        entry = { font, buffers: new Map() };
        sampleBufferCache.set(context, entry);
    }
    const perContext = entry.buffers;
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
 * Schedule TSF's amplitude envelope on a gain parameter.
 *
 * delay -> attack (linear, like tsf's slope) -> hold -> decay (exponential,
 * shortened like tsf does so that it lands on the sustain level) -> release
 * (exponential with the same -9.226 constant as the sample loop).
 *
 * Everything is written as explicit ramps rather than setTargetAtTime: tsf's
 * segments are pure exponentials (level *= exp(-9.226/T) per sample) and an
 * exponentialRamp is exactly that shape, which also keeps the automation
 * deterministic when the note off interrupts a segment.
 *
 * `peak` is the level the envelope reaches, i.e. already scaled by the note
 * gain and by the voice's pan factor when the caller folds the two together.
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
    const holdEnd = attackEnd + hold;
    // tsf.h: the decay segment is an exponential whose time constant is the
    // *whole* decay time (slope = exp(-9.226 / (decay * sampleRate))); the
    // segment is only shortened so that it lands exactly on the sustain level
    // (log(sustain) / mysterySlope). Using the shortened span as the time
    // constant as well made every 0 < sustain < 1 preset decay far too fast.
    const decaySpan = sustain >= 1 ? 0
        : sustain > 0 ? decay * (Math.log(sustain) / -TSF_ENVELOPE_SLOPE)
            : decay;
    const decayEnd = holdEnd + decaySpan;
    // where the exponential decay lands (tsf's segments decay through ~1e-4)
    const decayFloor = sustain > 0 ? sustain : Math.exp(-TSF_ENVELOPE_SLOPE);
    const gain = Math.max(peak, GAIN_FLOOR);
    // tsf walks its segments in order and skips the zero length ones, so an
    // envelope with no delay/attack/hold/decay sits at the *sustain* level -
    // jumping to full level instead made those voices play at the wrong gain.
    const initialLevel = attack > 0 ? 0 : (hold > 0 || decaySpan > 0 ? 1 : sustain);

    /** Envelope level (0..1) at time t, for truncating at the note off. */
    const levelAt = (t) => {
        if (t <= attackStart) return 0;
        if (t < attackEnd) return attack > 0 ? (t - attackStart) / attack : 1;
        if (t < holdEnd) return 1;
        if (decay > 0 && decaySpan > 0 && t < decayEnd) {
            return Math.exp(-TSF_ENVELOPE_SLOPE * ((t - holdEnd) / decay));
        }
        return decayFloor;
    };

    // A ramp is defined between the event before it and its own end time, so
    // every segment the note off cuts short needs an explicit value event at
    // the note off. Without one the release ramp starts at the previous event
    // instead: with a hold longer than the note that turned the whole hold into
    // an exponential decay (the graph lost ~15 dB/s where tsf holds flat), and
    // a release before the decay's end would silently move the decay's start.
    const releaseStart = Math.max(stop, start);
    const releaseLevel = Math.max(levelAt(releaseStart) * gain, GAIN_FLOOR);

    param.cancelScheduledValues(start);
    param.setValueAtTime(0, start);
    let lastEvent = start;
    if (delay > 0) { param.setValueAtTime(0, attackStart); lastEvent = attackStart; }

    // attack, truncated at the note off with the level reached there
    if (releaseStart > attackStart) {
        const attackStop = Math.min(attackEnd, releaseStart);
        if (attack > 0) {
            param.linearRampToValueAtTime(gain * ((attackStop - attackStart) / attack), attackStop);
            lastEvent = attackStop;
        } else {
            param.setValueAtTime(gain * initialLevel, attackStart);
            lastEvent = attackStart;
        }
    }

    // hold: an explicit value event so the decay ramp starts where tsf's does
    if (hold > 0 && holdEnd < releaseStart) { param.setValueAtTime(gain, holdEnd); lastEvent = holdEnd; }

    // A zero length decay segment is skipped, so tsf drops to the sustain level
    // as soon as the hold/attack is over. Missing that step left every
    // "attack, then hold, then sustain" patch (Drawbar Organ, Synth Brass 2,
    // Fifth Sawtooth Wave in FluidR3) exactly 20*log10(1/sustain) dB too loud.
    if (decaySpan <= 0 && sustain < 1 && holdEnd < releaseStart) {
        param.setValueAtTime(gain * sustain, holdEnd);
        lastEvent = holdEnd;
    }

    // exponential ramp = tsf's level *= exp(-9.226 / samples) per sample segment
    const decayEndClamped = Math.min(decayEnd, releaseStart);
    if (decaySpan > 0 && decayEndClamped > holdEnd) {
        param.exponentialRampToValueAtTime(gain * levelAt(decayEndClamped), decayEndClamped);
        lastEvent = decayEndClamped;
    }

    // Release: from the level reached at the note off down by the same -9.226
    // factor over `release` seconds (tsf's release segment).
    if (releaseStart > lastEvent) param.setValueAtTime(releaseLevel, releaseStart);
    param.exponentialRampToValueAtTime(releaseLevel * Math.exp(-TSF_ENVELOPE_SLOPE), releaseStart + release);
}

/**
 * Schedule TSF's modulation envelope as ramps of `amount * level`.
 *
 * tsf's modulation envelope is linear everywhere except that the attack is
 * scaled by velocity, and the release ramps the level down to zero. Because
 * the targets are AudioParams that take cents (source.detune, filter.detune,
 * and the filter cutoff in cents) the trajectory is *exactly* proportional to
 * the level, so plain ramps reproduce it - sampling it into a curve instead
 * quantised the fast segments (a 64 point curve over an 8 second span cannot
 * represent a 2 ms attack) and left the slow tail held instead of decaying.
 */
function scheduleModEnvelope(param, env, amount, start, stop, midiVelocity) {
    const delay = Math.max(0, env.delay || 0);
    // tsf.h: the modulation envelope attack scales with velocity.
    const attack = Math.max(0, env.attack || 0) * ((145 - midiVelocity) / 144);
    const hold = Math.max(0, env.hold || 0);
    const decay = Math.max(0, env.decay || 0);
    const sustain = Math.max(0, Math.min(1, env.sustain != null ? env.sustain : 1));
    const release = Math.max(0, env.release || 0);

    const attackStart = start + delay;
    const attackEnd = attackStart + attack;
    const holdEnd = attackEnd + hold;
    // tsf.h: the mod env decay is linear over decay * (1 - sustain).
    const decaySpan = decay * (1 - sustain);
    const decayEnd = holdEnd + decaySpan;
    // tsf skips the zero length segments: without an attack/hold/decay the
    // modulation level is the sustain level (often 0, i.e. no modulation)
    const initialLevel = attack > 0 ? 0 : (hold > 0 || decaySpan > 0 ? 1 : sustain);

    const levelAt = (t) => {
        if (t <= attackStart) return 0;
        if (t < attackEnd) return attack > 0 ? (t - attackStart) / attack : 1;
        if (t < holdEnd) return 1;
        if (decaySpan > 0 && t < decayEnd) return 1 - ((t - holdEnd) / decaySpan) * (1 - sustain);
        return sustain;
    };

    const releaseStart = Math.max(stop, start);
    const releaseLevel = levelAt(releaseStart);

    param.cancelScheduledValues(start);
    param.setValueAtTime(0, start);
    let lastEvent = start;
    if (delay > 0) { param.setValueAtTime(0, attackStart); lastEvent = attackStart; }

    if (releaseStart > attackStart) {
        const attackStop = Math.min(attackEnd, releaseStart);
        if (attack > 0) {
            param.linearRampToValueAtTime(amount * ((attackStop - attackStart) / attack), attackStop);
            lastEvent = attackStop;
        } else {
            param.setValueAtTime(amount * initialLevel, attackStart);
            lastEvent = attackStart;
        }
    }
    if (hold > 0 && holdEnd < releaseStart) { param.setValueAtTime(amount, holdEnd); lastEvent = holdEnd; }

    // tsf skips a zero length decay segment: the level drops to sustain right
    // after the attack/hold (see the amplitude envelope for the same rule)
    if (decaySpan <= 0 && sustain < 1 && holdEnd < releaseStart) {
        param.setValueAtTime(amount * sustain, holdEnd);
        lastEvent = holdEnd;
    }

    const decayStop = Math.min(decayEnd, releaseStart);
    if (decaySpan > 0 && decayStop > holdEnd) {
        param.linearRampToValueAtTime(amount * levelAt(decayStop), decayStop);
        lastEvent = decayStop;
    }

    // tsf.h: the mod env release is linear from the current level to zero.
    if (releaseStart > lastEvent) param.setValueAtTime(amount * releaseLevel, releaseStart);
    if (release > 0) param.linearRampToValueAtTime(0, releaseStart + release);
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
    // Sound quality: leave out the optional stages this preset turns off.
    const quality = resolveSF2Quality(this.settings);
    // noteOnVoices() comes from the shared synth instance, which the DSP engine
    // also writes to, so make sure the voices are set up for *this* preset.
    applySF2Quality(tsfQuality, this.settings);

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
    if (presetIndex < 0) {
        noteDropped(this, 'no preset for program/bank', option);
        return null;
    }

    const voices = noteOnVoices(font, presetIndex, option.pitch, velocity / 127);
    if (!voices.length) {
        noteDropped(this, 'no soundfont region matched the key/velocity', option);
        return null;
    }

    const sampleRate = context.sampleRate || 44100;
    const nyquist = sampleRate * 0.5;
    // tsf.h: the lowpass is only ever applied below 0.499 of the output rate.
    const maxFilterHz = Math.min(nyquist * 0.998, sampleRate * TSF_MAX_FILTER_RATIO);

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

    // One gain per note carries the user/channel/expression gain *and* acts as
    // the universal mute the player's stop function uses (that used to be a
    // second GainNode per note).
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
    if (this.masterGainNode) performanceGain.connect(this.masterGainNode);
    else if (context.destination) performanceGain.connect(context.destination);

    // pitch wheel: tsf applies it as extra semitones on the pitch ratio
    const pitchBends = (option.pitchBend && option.pitchBend.length)
        ? option.pitchBend.map((p) => ({
            time: Math.max(0, p.time + songStartTime + baseLatency),
            semitones: p.value,
        }))
        : null;
    // CC10 pan moves both pan factors like tsf_channel_set_pan; it forces the
    // two gain stereo path below (the single gain path assumes a fixed pan).
    const panChanges = (option.pan && option.pan.length) ? option.pan : null;

    const nodes = [];          // every node of this note, for the stop function
    const timers = [];         // e.g. stopping a sustain loop at note off
    let startedAny = false;
    let activeVoices = 0;
    let noteReleased = false;

    // Shared stereo stage: every voice's pan gains land here. It is only built
    // when a voice actually needs two channels (a centred voice does not).
    let merger = null;
    const getMerger = () => {
        if (!merger) {
            merger = context.createChannelMerger(2);
            merger.connect(performanceGain);
            nodes.push(merger);
        }
        return merger;
    };

    // The note's own gain nodes have to leave the graph when the audio is over:
    // notes that end on their own are only dropped from the player's stop list,
    // their stop function is never called.
    const releaseNoteGraph = () => {
        if (noteReleased) return;
        noteReleased = true;
        for (const t of timers) clearTimeout(t);
        timers.length = 0;
        if (merger) { try { merger.disconnect(); } catch (e) { /* noop */ } }
        try { performanceGain.disconnect(); } catch (e) { /* noop */ }
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
        const rate = tsfTimecentsToRate(voice) * (sampleRate / shdr.sampleRate);
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

        // --- filter ------------------------------------------------------
        // tsf only runs the lowpass while the modulated cutoff stays below the
        // 13500 cent "no filter" default; above that it drops the filter
        // entirely. Regions that can only ever be above it get no node at all
        // (GeneralUser GS has thousands of them), and the modulated cutoff is
        // clamped so the biquad never runs past the range tsf would use.
        const modEnv = voice.modenv.parameters;
        const envFilterCents = region.modEnvToFilterFc || 0;
        const lfoFilterCents = region.modLfoToFilterFc || 0;
        // lowest cutoff the modulation can ask for: tsf evaluates
        // fres = initialFilterFc + lfoLevel * lfoAmount + envLevel * envAmount
        // with both levels reaching +-1 / 0..1
        const minFilterCents = region.initialFilterFc
            + Math.min(0, envFilterCents) + Math.min(0, lfoFilterCents);
        // ...and it is only applied below 0.499 of the output sample rate
        let filter = null;
        let filterHeadroom = 0;
        const usableCents = Math.min(minFilterCents, TSF_FILTER_BYPASS_CENTS);
        if (quality.filter && tsfCents2Hertz(usableCents) / sampleRate < TSF_MAX_FILTER_RATIO) {
            filterHeadroom = TSF_FILTER_BYPASS_CENTS - region.initialFilterFc;
            const fc = Math.min(tsfCents2Hertz(region.initialFilterFc), maxFilterHz);
            if (fc > 0) {
                filter = context.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = fc;
                // tsf's earlevel lowpass peaks at Q = 10^(QdB/20) (0 dB for
                // the default Q), which is exactly what Web Audio's lowpass
                // does when its Q (in dB) equals the generator's decibels.
                filter.Q.value = region.initialFilterQ / 10;
                voiceNodes.push(filter);
            }
        }

        // --- gains -------------------------------------------------------
        // The amplitude envelope is written straight into the pan gains, so a
        // voice needs one gain node per channel instead of a level node plus
        // two pan nodes. A centred voice with no CC10 automation needs a single
        // gain: Web Audio duplicates the mono signal to both channels itself,
        // which is what tsf's sqrt(0.5) per channel comes out to.
        // A CC10 move keeps the classic level + pan node layout, because there
        // the two automations are independent (tsf re-applies the pan law to
        // the still running envelope).
        const peak = Math.max(0, tsfDecibelsToGain(voice.noteGainDB));
        const centered = Math.abs(voice.panFactorLeft - voice.panFactorRight) < 1e-6;
        const folded = !panChanges;
        const panL = context.createGain();
        const panR = (centered && folded) ? null : context.createGain();
        const level = folded ? null : context.createGain();
        const ampEnv = voice.ampenv.parameters;
        if (folded) {
            scheduleAmpEnvelope(panL.gain, ampEnv, start, stop, peak * voice.panFactorLeft);
            if (panR) scheduleAmpEnvelope(panR.gain, ampEnv, start, stop, peak * voice.panFactorRight);
        } else {
            scheduleAmpEnvelope(level.gain, ampEnv, start, stop, peak);
            panL.gain.value = voice.panFactorLeft;
            panR.gain.value = voice.panFactorRight;
            // channel pan (CC10) moves both factors like tsf_channel_set_pan
            panChanges.forEach((p) => {
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
        let volGain = null;   // mod LFO -> volume multiplies before the pan gains
        const lfoVolumeCents = region.modLfoToVolume || 0;

        // --- modulation --------------------------------------------------
        // tsf resolves the modulation envelope and the LFOs per sample block and
        // applies them to the pitch ratio, the cutoff and the note gain.
        if (quality.modEnv && region.modEnvToPitch) {
            scheduleModEnvelope(source.detune, modEnv, region.modEnvToPitch, start, stop, velocity);
        }
        if (quality.modEnv && filter && envFilterCents) {
            // clamped so fres stays inside the range tsf would filter
            const amount = Math.min(envFilterCents, filterHeadroom);
            scheduleModEnvelope(filter.detune, modEnv, amount, start, stop, velocity);
        }

        // LFOs modulate in *cents* in tsf (pitch, cutoff and volume alike). One
        // oscillator feeds every target, at tsf's own rate: the frequency
        // generator is in cents relative to 8.176 Hz (tsf_voice_lfo_setup:
        // delta = 4 * tsf_cents2hertz(freq) / outSampleRate).
        const addLfo = (delay, freqCents, pitchCents, filterCents, volCents) => {
            if (!pitchCents && !filterCents && !volCents) return null;
            const osc = context.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = Math.max(0.001, tsfCents2Hertz(freqCents));
            if (pitchCents) {
                const gain = context.createGain();
                gain.gain.value = pitchCents;
                osc.connect(gain);
                gain.connect(source.detune);
                voiceNodes.push(gain);
            }
            if (filterCents && filter) {
                const gain = context.createGain();
                gain.gain.value = Math.min(filterCents, Math.max(0, filterHeadroom));
                osc.connect(gain);
                gain.connect(filter.detune);
                voiceNodes.push(gain);
            }
            if (volCents) {
                // tsf: noteGain = decibelsToGain(noteGainDB + level * amount * 0.1),
                // so the factor is exponential in the LFO level - a wave shaper
                // turns the triangle into 10^(level * dB / 20), which drives the
                // gain param (its intrinsic value stays 0, the signal is the gain).
                const db = volCents * 0.1;
                const shaper = context.createWaveShaper();
                const curve = new Float32Array(1025);
                for (let i = 0; i < curve.length; i++) {
                    curve[i] = Math.pow(10, (((i / (curve.length - 1)) * 2) - 1) * db / 20);
                }
                shaper.curve = curve;
                const gain = context.createGain();
                gain.gain.value = 0;
                osc.connect(shaper);
                shaper.connect(gain.gain);
                voiceNodes.push(shaper, gain);
                if (!volGain) volGain = gain;
            }
            const lfoStart = start + Math.max(0, delay);
            osc.start(Math.max(lfoStart, context.currentTime));
            osc.stop(stop + 0.05);
            voiceNodes.push(osc);
            return osc;
        };
        if (quality.lfo) {
            addLfo(region.delayModLFO, region.freqModLFO, region.modLfoToPitch,
                lfoFilterCents, lfoVolumeCents);
            addLfo(region.delayVibLFO, region.freqVibLFO, region.vibLfoToPitch, 0, 0);
        }

        // --- graph -------------------------------------------------------
        let tail = source;
        if (filter) { source.connect(filter); tail = filter; }
        if (volGain) { tail.connect(volGain); tail = volGain; }
        if (level) { tail.connect(level); tail = level; voiceNodes.push(level); }
        if (panR) {
            tail.connect(panL);
            tail.connect(panR);
            panL.connect(getMerger(), 0, 0);
            panR.connect(getMerger(), 0, 1);
        } else {
            // centred: one gain, Web Audio itself duplicates it to both channels
            tail.connect(panL);
            panL.connect(performanceGain);
        }
        voiceNodes.push(panL);
        if (panR) voiceNodes.push(panR);

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
            for (const node of voiceNodes) { try { node.disconnect(); } catch (e2) { /* noop */ } }
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
        // tsf's SUSTAIN loop mode (generator value 3) stops looping at note off
        // and lets the rest of the sample play out
        if (region.loopMode === 2 && source.loop) {
            timers.push(setTimeout(() => {
                try { source.loop = false; } catch (e) { /* noop */ }
            }, Math.max(0, (stop - context.currentTime) * 1000)));
        }
        startedAny = true;
    }

    if (!startedAny) {
        try { merger.disconnect(); performanceGain.disconnect(); } catch (e) { /* noop */ }
        return null;
    }

    return () => {
        try { performanceGain.gain.cancelScheduledValues(context.currentTime); } catch (e) { /* noop */ }
        try { performanceGain.gain.setValueAtTime(0, context.currentTime); } catch (e) { /* noop */ }
        for (const node of nodes) {
            try { if (typeof node.stop === 'function') node.stop(); } catch (e) { /* noop */ }
            try { node.disconnect(); } catch (e) { /* noop */ }
        }
        nodes.length = 0;
        releaseNoteGraph();
    };
}

/** tsf's note pitch ratio without the output sample rate factor. */
function tsfTimecentsToRate(voice) {
    return Math.pow(2, voice.pitchInputTimecents / 1200) * voice.pitchOutputFactor;
}

export default { renderSF2NoteWebAudio };
