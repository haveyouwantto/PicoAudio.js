/**
 * SF2 renderer in an AudioWorklet: one node mixes every note, so the main thread only sends messages.
 * The synth inside is tsf-synth.js itself (stringified), so the output matches the main-thread engine.
 * The caller (sf2-renderer.js) falls back to that engine whenever playSF2Worklet returns null.
 */

import { createTsfSynth } from '../sf2/tsf-synth.js';
import {
    TSF_LOOPMODE_SUSTAIN,
    tsfTimecents2Secs,
    tsfCents2Hertz,
    tsfDecibelsToGain,
    tsfGainToDecibels,
} from '../sf2/tsf-font.js';
import { getSF2Font } from './sf2-provider.js';
import { resolveSF2Quality } from '../sf2/sf2-quality.js';

const PROCESSOR_NAME = 'picoaudio-sf2';

/* ----------------------------------------------------------- processor --- */

// Runs inside the worklet from its source text: only use the arguments and worklet globals.
function createProcessor(tsfSynth, quality) {
    return class PicoAudioSf2Processor extends AudioWorkletProcessor {
        constructor() {
            super();
            this.font = null;
            this.notes = [];
            this.port.onmessage = (event) => this.handleMessage(event.data);
        }

        handleMessage(msg) {
            switch (msg.type) {
                case 'font':
                    this.font = msg.font;
                    this.notes.length = 0;
                    break;
                case 'note':
                    if (!this.font) return;
                    this.notes.push({
                        id: msg.id,
                        renderer: tsfSynth.createNoteRenderer(
                            this.font, msg.presetIndex, msg.key, msg.velocity,
                            msg.noteFrames, msg.maxFrames, msg.pitchBends, msg.panChanges,
                            msg.interpolation),
                        nextFrame: msg.startFrame,
                        endFrame: msg.startFrame + msg.maxFrames,
                        maxFrames: msg.maxFrames,
                        gains: msg.gains,
                        gainIndex: 0,
                        frames: 0,
                        // a TSF effect block can straddle a render quantum, so it is carried over
                        pending: new Float32Array(tsfSynth.TSF_RENDER_EFFECTSAMPLEBLOCK * 2),
                        pendingFrames: 0,
                        pendingAt: 0,
                    });
                    break;
                case 'stop':
                    this.notes = this.notes.filter((note) => note.id !== msg.id);
                    break;
                case 'quality':
                    Object.assign(quality, msg.quality);
                    break;
            }
        }

        // mix every note that overlaps [frame0, frame0 + block)
        renderNotes(outL, outR, frame0, block) {
            const quantumEnd = frame0 + block;
            for (let i = this.notes.length - 1; i >= 0; i--) {
                const note = this.notes[i];
                if (note.nextFrame < frame0) note.nextFrame = frame0;
                while (note.nextFrame < quantumEnd && note.nextFrame < note.endFrame) {
                    if (!note.pendingFrames) {
                        const frames = Math.min(tsfSynth.TSF_RENDER_EFFECTSAMPLEBLOCK,
                            note.maxFrames - note.frames);
                        const got = note.renderer.render(frames, note.pending);
                        if (!got) break;
                        note.pendingFrames = got;
                        note.pendingAt = 0;
                    }
                    const room = Math.min(quantumEnd - note.nextFrame, note.endFrame - note.nextFrame);
                    const take = Math.min(note.pendingFrames - note.pendingAt, room);
                    const offset = note.nextFrame - frame0;
                    const { gains, pending } = note;
                    for (let f = 0; f < take; f++) {
                        const frame = note.frames + f;
                        while (note.gainIndex + 1 < gains.length
                            && gains[note.gainIndex + 1].frame <= frame) note.gainIndex++;
                        const gain = gains[note.gainIndex].value;
                        const src = (note.pendingAt + f) * 2;
                        outL[offset + f] += pending[src] * gain;
                        outR[offset + f] += pending[src + 1] * gain;
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
            const [outL, outR] = outputs[0];
            outL.fill(0);
            outR.fill(0);
            this.renderNotes(outL, outR, currentFrame, outL.length);
            return true;
        }
    };
}

// Module source: the synth and the processor are stringified, with the tsf-font helpers declared in scope.
function sf2WorkletSource() {
    return [
        "'use strict';",
        `const TSF_LOOPMODE_SUSTAIN = ${TSF_LOOPMODE_SUSTAIN};`,
        `const tsfTimecents2Secs = ${tsfTimecents2Secs.toString()};`,
        `const tsfCents2Hertz = ${tsfCents2Hertz.toString()};`,
        `const tsfDecibelsToGain = ${tsfDecibelsToGain.toString()};`,
        `const tsfGainToDecibels = ${tsfGainToDecibels.toString()};`,
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

const workletEngines = new WeakMap();

function getWorkletEngine(context) {
    let engine = workletEngines.get(context);
    if (!engine) {
        engine = {
            node: null, ready: false, failed: false, initializing: false,
            connected: false, font: null, quality: null, nextId: 1,
        };
        workletEngines.set(context, engine);
    }
    return engine;
}

/** Send the loaded SoundFont to the worklet (call after loading a font, to avoid a stall at the first note). */
export function pushSF2WorkletFont(picoAudio) {
    const context = picoAudio && picoAudio.context;
    if (!context) return;
    const font = getSF2Font();
    const engine = getWorkletEngine(context);
    if (!font || !engine.ready || engine.font === font) return;
    try {
        engine.node.port.postMessage({
            type: 'font',
            font: {
                presets: font.presets,
                samples: font.samples,
                outSampleRate: font.outSampleRate,
                globalGainDB: font.globalGainDB,
            },
        });
        engine.font = font;
    } catch (e) {
        engine.failed = true;
        console.warn('PicoAudio: could not hand the SoundFont to the AudioWorklet', e);
    }
}

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
        engine.node = new AudioWorkletNode(context, PROCESSOR_NAME, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
        });
        engine.ready = true;
        pushSF2WorkletFont(picoAudio);
    }).catch((e) => {
        URL.revokeObjectURL(url);
        engine.failed = true;
        console.warn('PicoAudio: SF2 AudioWorklet unavailable, using the main-thread engine', e);
    });
}

/** Start loading the worklet module before the first note. */
export function prepareSF2Worklet(picoAudio) {
    const context = picoAudio && picoAudio.context;
    if (context) initWorklet(getWorkletEngine(context), context, picoAudio);
}

/**
 * Play a prepared note (fields as posted below) in the worklet.
 * Returns a stop function, or null while the worklet is not usable.
 */
export function playSF2Worklet(picoAudio, note) {
    const context = picoAudio.context;
    const engine = getWorkletEngine(context);
    if (!engine.ready) {
        initWorklet(engine, context, picoAudio);
        return null;
    }
    if (!engine.connected) {
        engine.node.connect(picoAudio.masterGainNode || context.destination);
        engine.connected = true;
    }

    const font = getSF2Font();
    if (engine.font !== font) {
        pushSF2WorkletFont(picoAudio);
        if (engine.font !== font) return null;
    }

    const quality = resolveSF2Quality(picoAudio.settings);
    if (engine.quality !== quality) {
        engine.node.port.postMessage({ type: 'quality', quality });
        engine.quality = quality;
    }

    const id = engine.nextId++;
    engine.node.port.postMessage({ type: 'note', id, ...note });
    return () => engine.node.port.postMessage({ type: 'stop', id });
}