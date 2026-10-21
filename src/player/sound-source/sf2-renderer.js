/**
 * SF2 note renderer: TinySoundFont port, played through BufferSourceNodes.
 * Fast path: the AudioWorklet (sf2-worklet-renderer.js) when settings.sf2Engine === 'worklet'.
 * Fallback: chunked synthesis on the main thread (also used for offline contexts).
 */

import { getSF2Font, getSF2PresetIndex } from "./sf2-provider.js";
import { createNoteRenderer, resolveInterpolation, tsfQuality } from "../sf2/tsf-synth.js";
import { applySF2Quality, resolveSF2Interpolation } from "../sf2/sf2-quality.js";
import { playSF2Worklet } from "./sf2-worklet-renderer.js";

const SF2_MAX_TAIL_SECONDS = 30;
const SF2_STREAM_CHUNK_SECONDS = 0.25;
// background tabs delay timers, so keep extra audio queued
const SF2_STREAM_LOOKAHEAD_SECONDS = 2;
const SF2_STREAM_PUMP_MS = 200;
// max time one top-up may block the main thread
const SF2_STREAM_BUDGET_MS = 4;

// -12 dB keeps SF2 at the level of the other sound modes
const SF2_OUTPUT_TRIM = Math.pow(10, -12 / 20);
const PICO_GENERATE_VOLUME_REFERENCE = 0.15;

// notes whose remaining audio is still being synthesized by a timer
const activeStreamers = new Set();

/** Synthesize everything that is left right away (for hidden tabs). */
export function flushSF2Streaming() {
    for (const streamer of [...activeStreamers]) streamer.flush();
    return activeStreamers.size;
}

// one scratch buffer for all notes: a chunk is copied out before the next render
let streamScratch = null;

function getStreamScratch(frames) {
    if (!streamScratch || streamScratch.length < frames * 2) streamScratch = new Float32Array(frames * 2);
    return streamScratch;
}

// free list of chunk AudioBuffers, so a dense song does not allocate ~200 buffers/s
const CHUNK_POOL_MAX_BYTES = 16 * 1024 * 1024;
const chunkPool = new Map();
let chunkPoolContext = null;
let chunkPoolBytes = 0;

function takeChunkBuffer(context, frames, sampleRate) {
    if (chunkPoolContext !== context) {
        chunkPool.clear();
        chunkPoolBytes = 0;
        chunkPoolContext = context;
    }
    const free = chunkPool.get(frames);
    while (free && free.length) {
        const buffer = free.pop();
        chunkPoolBytes -= frames * 8;
        if (buffer.sampleRate === sampleRate && buffer.numberOfChannels === 2) return buffer;
    }
    return context.createBuffer(2, frames, sampleRate);
}

function releaseChunkBuffer(buffer) {
    const bytes = buffer.length * 8;
    if (!bytes || chunkPoolBytes + bytes > CHUNK_POOL_MAX_BYTES) return;
    let free = chunkPool.get(buffer.length);
    if (!free) {
        free = [];
        chunkPool.set(buffer.length, free);
    }
    free.push(buffer);
    chunkPoolBytes += bytes;
}

/** Automation list -> [{frame, value}] relative to the note start, sorted; null when empty. */
function toFrames(list, start, offset, sampleRate, mapValue) {
    if (!list || !list.length) return null;
    return list
        .map((p) => ({
            frame: Math.max(0, Math.round((p.time + offset - start) * sampleRate)),
            value: mapValue(p.value),
        }))
        .sort((a, b) => a.frame - b.frame);
}

/**
 * Render one SF2 note. Call with `this` = PicoAudio instance.
 * Returns a stop function, or null when nothing sounds.
 */
export function renderSF2Note(option) {
    const context = this.context;
    const font = getSF2Font();
    if (!font) return null;

    const offset = (this.states && this.states.startTime ? this.states.startTime : 0) + (this.baseLatency || 0);
    const start = option.startTime + offset;
    const stop = option.stopTime + offset;
    const isDrum = option.isDrum === true || option.channel === 9;

    const velocity = Math.max(0, Math.min(127, Math.round(option.midiVelocity ?? (option.velocity ?? 1) * 127)));
    // note-on with velocity 0 is a note-off
    if (velocity === 0) return null;

    const presetIndex = getSF2PresetIndex(option.instrument, isDrum, option.bank || 0, option.pitch, velocity);
    if (presetIndex < 0) return null;

    const sampleRate = context.sampleRate || 44100;
    const noteFrames = Math.max(1, Math.round((stop - start) * sampleRate));
    const maxFrames = noteFrames + Math.round(SF2_MAX_TAIL_SECONDS * sampleRate);

    // output level = app volume x channel volume x (CC7 * CC11)^3
    const channel = option.channel ?? 0;
    const userGain = Math.max(0, SF2_OUTPUT_TRIM
        * ((this.settings?.generateVolume ?? PICO_GENERATE_VOLUME_REFERENCE) / PICO_GENERATE_VOLUME_REFERENCE)
        * (this.channels?.[channel]?.[2] ?? 1));
    const midiVolume = (option.midiVolume ?? 127) / 127;
    const gainOf = (expression127) => userGain * Math.pow(midiVolume * expression127 / 127, 3);

    const expression = option.expression && option.expression.length ? option.expression : null;
    const gains = [
        { frame: 0, value: gainOf(expression ? expression[0].value : (option.midiExpression ?? 127)) },
        ...(toFrames(expression, start, offset, sampleRate, gainOf) || []),
    ];

    const note = {
        presetIndex,
        key: option.pitch,
        velocity: velocity / 127,
        noteFrames,
        maxFrames,
        startFrame: Math.round(start * sampleRate),
        pitchBends: toFrames(option.pitchBend, start, offset, sampleRate, (v) => v),
        panChanges: toFrames(option.pan, start, offset, sampleRate, (v) => (v << 7) / 16383),
        gains,
        interpolation: resolveSF2Interpolation(this.settings),
    };

    const isOffline = typeof OfflineAudioContext !== 'undefined' && context instanceof OfflineAudioContext;
    if (this.settings?.sf2Engine === 'worklet' && !isOffline) {
        const stopWorklet = playSF2Worklet(this, note);
        if (stopWorklet) return stopWorklet;
    }

    applySF2Quality(tsfQuality, this.settings);

    const chunkFrames = Math.max(1024, Math.round(SF2_STREAM_CHUNK_SECONDS * sampleRate));
    const renderer = createNoteRenderer(
        font, presetIndex, note.key, note.velocity, noteFrames, maxFrames,
        note.pitchBends, note.panChanges, resolveInterpolation(note.interpolation));
    const outputNode = this.masterGainNode || context.destination;

    const sources = [];
    let scheduledFrames = 0;
    let gainIndex = 0;
    let stopped = false;
    let timer = null;

    function scheduleChunk() {
        if (stopped) return false;
        const data = getStreamScratch(chunkFrames);
        const written = renderer.render(chunkFrames, data);
        if (!written) return false;

        // always a full-length buffer, so the pool has a single size class
        const buffer = takeChunkBuffer(context, chunkFrames, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        let frame = scheduledFrames;
        for (let i = 0, j = 0; i < written; i++, frame++) {
            while (gainIndex + 1 < gains.length && gains[gainIndex + 1].frame <= frame) gainIndex++;
            left[i] = data[j++] * gains[gainIndex].value;
            right[i] = data[j++] * gains[gainIndex].value;
        }
        if (written < chunkFrames) {
            left.fill(0, written);
            right.fill(0, written);
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(outputNode);
        const isLastChunk = renderer.isDone();
        source.onended = () => {
            source.disconnect();
            releaseChunkBuffer(buffer);
            if (isLastChunk && !stopped) activeStreamers.delete(streamer);
        };
        try {
            source.start(start + scheduledFrames / sampleRate);
        } catch (e) {
            source.disconnect();
            return false;
        }
        sources.push(source);
        scheduledFrames += written;
        return true;
    }

    function pump() {
        timer = null;
        if (stopped) return;
        const deadline = performance.now() + SF2_STREAM_BUDGET_MS;
        const queuedUntil = () => start + scheduledFrames / sampleRate;
        while (!renderer.isDone()
            && queuedUntil() < context.currentTime + SF2_STREAM_LOOKAHEAD_SECONDS
            && performance.now() < deadline) {
            if (!scheduleChunk()) return;
        }
        if (renderer.isDone()) { activeStreamers.delete(streamer); return; }
        const filled = queuedUntil() >= context.currentTime + SF2_STREAM_LOOKAHEAD_SECONDS;
        timer = setTimeout(pump, filled ? SF2_STREAM_PUMP_MS : 0);
    }

    const streamer = {
        flush() {
            if (stopped) return;
            clearTimeout(timer);
            timer = null;
            while (!renderer.isDone() && scheduleChunk());
            activeStreamers.delete(streamer);
        },
    };

    if (isOffline) {
        // no clock to come back on: schedule every chunk now
        while (!renderer.isDone() && scheduleChunk());
    } else {
        activeStreamers.add(streamer);
        scheduleChunk();
        if (!renderer.isDone()) timer = setTimeout(pump, 0);
    }

    if (sources.length === 0) return null;

    // the chunks already contain the release; stopping the sources is the mute
    return () => {
        stopped = true;
        clearTimeout(timer);
        activeStreamers.delete(streamer);
        for (const source of sources) {
            try { source.stop(); } catch (e) { /* not started */ }
            source.disconnect();
        }
        sources.length = 0;
    };
}

export default { renderSF2Note, flushSF2Streaming };