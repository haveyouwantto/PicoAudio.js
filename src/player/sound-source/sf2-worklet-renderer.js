/**
 * SF2 Renderer — AudioWorklet edition
 *
 * The Web Audio engine (sf2-webaudio-renderer.js) runs the whole per-voice DSP
 * as an AudioNode graph. Measured with scripts/browser-bench.mjs --page=rt-profile
 * that graph costs ~0.5 of a core for a dense GeneralUser song (~1350 live
 * nodes, ~180 voices), spread over the nodes and paid on the audio thread,
 * where every render quantum has a hard deadline - so dense sections glitch on
 * machines that cannot keep up.
 *
 * This engine keeps the same idea (do not block the main thread) but drops the
 * node graph: a single AudioWorkletProcessor hosts the *DSP engine's own*
 * implementation and mixes every scheduled note into one stereo output.
 * - one node instead of ~7 per voice,
 * - no per-sample AudioParam automation,
 * - output identical to the DSP engine (same code path, same interpolation and
 *   envelopes), because the processor is built from tsf-synth.js itself through
 *   Function.prototype.toString - not from a copy of it.
 *
 * Notes are scheduled sample accurately: the main thread sends start/stop in
 * context frames, the processor compares them against the worklet's own
 * currentFrame counter.
 *
 * Offline rendering (WAV/video export) is not realtime constrained, so it
 * stays on the DSP engine - see renderSF2Note() in sf2-renderer.js.
 */

import { createTsfSynth } from '../sf2/tsf-synth.js';
import {
    TSF_LOOPMODE_SUSTAIN,
    tsfTimecents2Secs,
    tsfCents2Hertz,
    tsfDecibelsToGain,
    tsfGainToDecibels,
} from '../sf2/tsf-font.js';
import { getSF2Font, getSF2PresetIndex } from './sf2-provider.js';
import { resolveSF2Quality, resolveSF2Interpolation } from '../sf2/sf2-quality.js';
import { noteDropped } from '../../util/note-debug.js';

/** App level trim, same value as the other SF2 renderers. */
const SF2_OUTPUT_TRIM_DB = -12;
const SF2_OUTPUT_TRIM = Math.pow(10, SF2_OUTPUT_TRIM_DB / 20);
const PICO_GENERATE_VOLUME_REFERENCE = 0.15;
/** Hard cap on the release tail that is rendered past the note-off. */
const SF2_MAX_TAIL_SECONDS = 30;

const PROCESSOR_NAME = 'picoaudio-sf2';

/* ----------------------------------------------------------- processor --- */

/**
 * The processor class, as a factory so its source text can be evaluated inside
 * the worklet (it only depends on `tsfSynth` and worklet globals).
 */
function createProcessor(tsfSynth, quality) {
    return class PicoAudioSf2Processor extends AudioWorkletProcessor {
        constructor() {
            super();
            this.font = null;
            this.notes = [];
            this.scratch = new Float32Array(256 * 2);
            this.capture = null;
            this.port.onmessage = (event) => this.handleMessage(event.data);
        }

        handleMessage(msg) {
            if (!msg) return;
            switch (msg.type) {
                case 'font':
                    this.font = msg.font;
                    this.notes.length = 0;
                    break;
                case 'note': {
                    if (!this.font) return;
                    this.notes.push({
                        id: msg.id,
                        renderer: tsfSynth.createNoteRenderer(
                            this.font, msg.presetIndex, msg.key, msg.velocity,
                            msg.noteFrames, msg.maxFrames, msg.pitchBends, msg.panChanges,
                            msg.interpolation),
                        startFrame: msg.startFrame,
                        nextFrame: msg.startFrame,
                        endFrame: msg.startFrame + msg.maxFrames,
                        maxFrames: msg.maxFrames,
                        gains: msg.gains,
                        gainIndex: 0,
                        frames: 0,
                        // one TSF effect block can straddle a render quantum
                        // boundary, so it is rendered whole and carried over
                        pending: new Float32Array(tsfSynth.TSF_RENDER_EFFECTSAMPLEBLOCK * 2),
                        pendingFrames: 0,
                        pendingAt: 0,
                    });
                    break;
                }
                case 'stop':
                    for (let i = this.notes.length - 1; i >= 0; i--) {
                        if (this.notes[i].id === msg.id) this.notes.splice(i, 1);
                    }
                    break;
                case 'allOff':
                    this.notes.length = 0;
                    break;
                case 'quality':
                    Object.assign(quality, msg.quality);
                    break;
                case 'capture':
                    this.capture = {
                        fromFrame: msg.fromFrame, toFrame: msg.toFrame, written: 0,
                        data: new Float32Array((msg.toFrame - msg.fromFrame) * 2),
                    };
                    break;
                default:
                    break;
            }
        }

        /**
         * Mix every note whose [start, end) window overlaps this quantum.
         *
         * Notes are rendered one TSF_RENDER_EFFECTSAMPLEBLOCK at a time and the
         * block is buffered until it fits, so the envelope grid is exactly the
         * one a whole note render produces no matter where the quantum
         * boundaries fall.
         */
        renderNotes(outL, outR, frame0, block) {
            const quantumEnd = frame0 + block;
            for (let i = this.notes.length - 1; i >= 0; i--) {
                const note = this.notes[i];
                if (note.nextFrame < frame0) note.nextFrame = frame0;
                while (note.nextFrame < quantumEnd && note.nextFrame < note.endFrame) {
                    if (!note.pendingFrames) {
                        const frames = Math.min(tsfSynth.TSF_RENDER_EFFECTSAMPLEBLOCK,
                            note.maxFrames - note.frames);
                        const got = note.renderer.render(frames, this.scratch);
                        if (!got) break;
                        note.pending.set(this.scratch.subarray(0, got * 2));
                        note.pendingFrames = got;
                        note.pendingAt = 0;
                    }
                    const room = Math.min(quantumEnd - note.nextFrame, note.endFrame - note.nextFrame);
                    const take = Math.min(note.pendingFrames - note.pendingAt, room);
                    const offset = note.nextFrame - frame0;
                    const gains = note.gains;
                    for (let f = 0; f < take; f++) {
                        const frame = note.frames + f;
                        while (note.gainIndex + 1 < gains.length
                            && gains[note.gainIndex + 1].frame <= frame) note.gainIndex++;
                        const gain = gains[note.gainIndex].gain;
                        const src = (note.pendingAt + f) * 2;
                        outL[offset + f] += note.pending[src] * gain;
                        outR[offset + f] += note.pending[src + 1] * gain;
                    }
                    note.pendingAt += take;
                    note.frames += take;
                    note.nextFrame += take;
                    if (note.pendingAt >= note.pendingFrames) note.pendingFrames = 0;
                }
                if ((!note.pendingFrames && note.renderer.isDone()) || note.nextFrame >= note.endFrame) {
                    this.notes.splice(i, 1);
                }
            }
        }

        process(inputs, outputs) {
            const out = outputs[0];
            const outL = out[0];
            const outR = out[1];
            const block = outL.length;
            if (this.scratch.length < block * 2) this.scratch = new Float32Array(block * 2);
            const frame0 = currentFrame;
            outL.fill(0);
            outR.fill(0);

            this.renderNotes(outL, outR, frame0, block);

            // Verification hook: hand a rendered range back to the main thread so
            // the worklet's output can be compared with the DSP renderer.
            const cap = this.capture;
            if (cap) {
                const from = Math.max(frame0, cap.fromFrame);
                const to = Math.min(frame0 + block, cap.toFrame);
                for (let f = 0; f < to - from; f++) {
                    cap.data[(cap.written + f) * 2] = outL[from - frame0 + f];
                    cap.data[(cap.written + f) * 2 + 1] = outR[from - frame0 + f];
                }
                cap.written += Math.max(0, to - from);
                if (cap.written >= cap.data.length / 2) {
                    this.port.postMessage({ type: 'capture', fromFrame: cap.fromFrame, data: cap.data });
                    this.capture = null;
                }
            }
            return true;
        }
    };
}

/**
 * Source of the worklet module.
 *
 * The synthesizer part is the DSP engine's implementation itself: the factory
 * below is stringified and evaluated inside the worklet, with the tsf-font
 * helpers it needs declared in that scope. That keeps a single implementation
 * (and a single place to fix bugs) instead of a copy that drifts.
 */
export function sf2WorkletSource() {
    return [
        "'use strict';",
        `const TSF_LOOPMODE_SUSTAIN = ${TSF_LOOPMODE_SUSTAIN};`,
        `const tsfTimecents2Secs = ${tsfTimecents2Secs.toString()};`,
        `const tsfCents2Hertz = ${tsfCents2Hertz.toString()};`,
        `const tsfDecibelsToGain = ${tsfDecibelsToGain.toString()};`,
        `const tsfGainToDecibels = ${tsfGainToDecibels.toString()};`,
        // mutable so a quality change applies to the notes started after it
        'const quality = { filter: true, lfo: true, modEnv: true };',
        `const tsfSynth = (${createTsfSynth.toString()})({`,
        '    TSF_LOOPMODE_SUSTAIN, tsfTimecents2Secs, tsfCents2Hertz,',
        '    tsfDecibelsToGain, tsfGainToDecibels, quality,',
        '});',
        `const Processor = (${createProcessor.toString()})(tsfSynth, quality);`,
        `registerProcessor(${JSON.stringify(PROCESSOR_NAME)}, Processor);`,
    ].join('\n');
}

/* ------------------------------------------------------- main thread ----- */

/** Per AudioContext worklet state. */
const workletEngines = new WeakMap();

function getWorkletEngine(context) {
    let engine = workletEngines.get(context);
    if (!engine) {
        engine = {
            node: null, ready: false, failed: false, initializing: false,
            font: null, nextId: 1,
        };
        workletEngines.set(context, engine);
    }
    return engine;
}

/**
 * Copy the SoundFont into the worklet.
 *
 * The sample data is sent as a structured clone (a few dozen MB for a full GM
 * font), which is a ~100 ms job - so it is done when the font is loaded rather
 * than when the first note arrives.
 */
export function pushSF2WorkletFont(picoAudio) {
    const context = picoAudio && picoAudio.context;
    if (!context) return;
    const font = getSF2Font();
    const engine = getWorkletEngine(context);
    if (!font || !engine.ready || engine.font === font) return;
    try {
        engine.node.port.postMessage({ type: 'font', font: fontPayload(font) });
        engine.font = font;
    } catch (e) {
        engine.failed = true;
        console.warn('PicoAudio: could not hand the SoundFont to the AudioWorklet', e);
    }
}

/** Load the module and create the node (idempotent, async). */
function initWorklet(engine, context, picoAudio) {
    if (engine.ready || engine.failed || engine.initializing) return;
    if (!context.audioWorklet || typeof AudioWorkletNode === 'undefined') {
        engine.failed = true;
        return;
    }
    engine.initializing = true;
    const url = URL.createObjectURL(new Blob([sf2WorkletSource()], { type: 'text/javascript' }));
    context.audioWorklet.addModule(url).then(() => {
        URL.revokeObjectURL(url);
        const node = new AudioWorkletNode(context, PROCESSOR_NAME, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
        });
        engine.node = node;
        engine.ready = true;
        pushSF2WorkletFont(picoAudio);
    }).catch((e) => {
        URL.revokeObjectURL(url);
        engine.failed = true;
        console.warn('PicoAudio: SF2 AudioWorklet unavailable, using the DSP engine', e);
    });
}

/** Everything the synthesizer reads from the font, as a cloneable object. */
function fontPayload(font) {
    return {
        presets: font.presets,
        samples: font.samples,
        outSampleRate: font.outSampleRate,
        globalGainDB: font.globalGainDB,
    };
}

function isOfflineContext(context) {
    return typeof OfflineAudioContext !== 'undefined' && context instanceof OfflineAudioContext;
}

/**
 * Render one SF2 note through the worklet.
 * Must be called with `this` = PicoAudio instance; returns the stop function,
 * or null when the worklet cannot take the note (caller falls back to the DSP
 * engine: booting, unsupported, or offline rendering).
 */
export function renderSF2NoteWorklet(option) {
    const context = this.context;
    const font = getSF2Font();
    if (!font) return null;
    // Offline rendering has no wall clock for the message queue and is not
    // realtime constrained - sf2-renderer.js keeps it on the DSP engine.
    if (isOfflineContext(context)) return null;

    const engine = getWorkletEngine(context);
    if (!engine.ready) {
        initWorklet(engine, context, this);
        return null;
    }
    // The worklet mixes every note, so it sits where the other engines put
    // their per-note output stage: in front of the master chain.
    if (!engine.connected) {
        engine.node.connect(this.masterGainNode || context.destination);
        engine.connected = true;
    }

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

    const sampleRate = context.sampleRate || 44100;
    const noteFrames = Math.max(1, Math.round((stop - start) * sampleRate));
    const maxFrames = noteFrames + Math.round(SF2_MAX_TAIL_SECONDS * sampleRate);

    // Pitch bend / channel pan automation, in frames relative to the note start
    // (same mapping the DSP renderer uses).
    const pitchBends = (option.pitchBend && option.pitchBend.length
        ? option.pitchBend.map((p) => ({
            frame: Math.max(0, Math.round(((p.time + songStartTime + baseLatency) - start) * sampleRate)),
            value: p.value,
        })).sort((a, b) => a.frame - b.frame)
        : null);
    const panChanges = (option.pan && option.pan.length
        ? option.pan.map((p) => ({
            frame: Math.max(0, Math.round(((p.time + songStartTime + baseLatency) - start) * sampleRate)),
            value: (p.value << 7) / 16383,
        })).sort((a, b) => a.frame - b.frame)
        : null);

    // Per note output stage: user volume, channel volume, and (CC7 * CC11)^3,
    // evaluated as steps - the same values the DSP renderer schedules on its
    // note gain node.
    const configuredGenerateVolume = this.settings && Number.isFinite(this.settings.generateVolume)
        ? this.settings.generateVolume
        : PICO_GENERATE_VOLUME_REFERENCE;
    const channel = Number.isInteger(option.channel) ? option.channel : 0;
    const channelVolume = this.channels && this.channels[channel] && this.channels[channel][2] != null
        ? this.channels[channel][2]
        : 1;
    const userGain = Math.max(0, SF2_OUTPUT_TRIM
        * (configuredGenerateVolume / PICO_GENERATE_VOLUME_REFERENCE)
        * channelVolume);
    const midiVolume = (Number.isFinite(option.midiVolume) ? option.midiVolume : 127) / 127;
    const midiExpression = Number.isFinite(option.midiExpression) ? option.midiExpression : 127;
    const channelGain = (expression01) => Math.pow(midiVolume * expression01, 3);

    const expression = option.expression && option.expression.length ? option.expression : null;
    const gains = [{
        frame: 0,
        gain: userGain * channelGain(expression ? expression[0].value / 127 : midiExpression / 127),
    }];
    if (expression) {
        expression.forEach((point) => {
            gains.push({
                frame: Math.max(0, Math.round(((point.time + songStartTime + baseLatency) - start) * sampleRate)),
                gain: userGain * channelGain(point.value / 127),
            });
        });
        gains.sort((a, b) => a.frame - b.frame);
    }

    if (engine.font !== font) {
        // normally already sent when the font was loaded - this covers a font
        // that was loaded before the worklet module finished loading
        pushSF2WorkletFont(this);
        if (engine.font !== font) return null;
    }

    const id = engine.nextId++;
    const quality = resolveSF2Quality(this.settings);
    if (engine.quality !== quality) {
        engine.node.port.postMessage({ type: 'quality', quality });
        engine.quality = quality;
    }
    engine.node.port.postMessage({
        type: 'note',
        id,
        presetIndex,
        key: option.pitch,
        velocity: velocity / 127,
        noteFrames,
        maxFrames,
        startFrame: Math.round(start * sampleRate),
        pitchBends,
        panChanges,
        gains,
        // the quality preset can override the interpolation (low = nearest)
        interpolation: resolveSF2Interpolation(this.settings),
    });

    // Universal mute for the stop manager (song stop / note stealing).
    return () => engine.node.port.postMessage({ type: 'stop', id });
}

/**
 * Schedule a capture of `seconds` of the worklet's own output, starting at
 * `fromSeconds` on the context clock. Resolves with interleaved stereo frames -
 * used by the verification harness to compare against the DSP engine.
 */
export function captureSF2Worklet(context, fromSeconds, seconds) {
    const engine = workletEngines.get(context);
    if (!engine || !engine.ready) return Promise.reject(new Error('SF2 worklet is not ready'));
    const rate = context.sampleRate || 44100;
    const fromFrame = Math.round(fromSeconds * rate);
    const toFrame = fromFrame + Math.round(seconds * rate);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('SF2 worklet capture timed out')), 30000);
        engine.node.port.onmessage = (event) => {
            if (!event.data || event.data.type !== 'capture') return;
            clearTimeout(timer);
            engine.node.port.onmessage = null;
            resolve(event.data.data);
        };
        engine.node.port.postMessage({ type: 'capture', fromFrame, toFrame });
    });
}

/** True once the worklet module is loaded and the node exists. */
export function isSF2WorkletReady(context) {
    const engine = workletEngines.get(context);
    return !!engine && engine.ready;
}

/**
 * Start loading the worklet module ahead of the first note (the engine can
 * then take every note; otherwise the notes until it is ready are rendered by
 * the DSP engine).
 */
export function prepareSF2Worklet(picoAudio) {
    const context = picoAudio && picoAudio.context;
    if (!context) return;
    initWorklet(getWorkletEngine(context), context, picoAudio);
}

export default {
    renderSF2NoteWorklet,
    sf2WorkletSource,
    captureSF2Worklet,
    isSF2WorkletReady,
    prepareSF2Worklet,
    pushSF2WorkletFont,
};
