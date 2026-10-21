/**
 * SF2 Renderer — TinySoundFont port edition
 *
 * A note is synthesized by the ported TinySoundFont renderer
 * (player/sf2/tsf-synth.js) into stereo PCM, then played through
 * BufferSourceNodes. That means the whole signal path — region selection,
 * envelope, filter, LFOs, looping, pan and gain — is the reference
 * implementation's, so the output matches TinySoundFont sample for sample
 * instead of approximating it with a Web Audio node graph.
 *
 * Long notes are streamed: the synth is stateful and produces one chunk at a
 * time while the previous chunk plays, so a 60 second pad no longer blocks the
 * main thread for ~40ms and ~20MB at note-on. Offline contexts (wav/video
 * export) have no wall clock to follow and render the whole note in one go.
 *
 * The only things added on top are the ones the application needs and TSF has
 * no concept of: the pre-scheduled pitch bend / expression automation of
 * PicoAudio's note objects, the user volume, and a universal mute for the
 * stop manager.
 */

import { getSF2Font, getSF2PresetIndex } from "./sf2-provider.js";
import { createNoteRenderer, resolveInterpolation, tsfQuality } from "../sf2/tsf-synth.js";
import { applySF2Quality, resolveSF2Interpolation } from "../sf2/sf2-quality.js";
import { renderSF2NoteWebAudio } from "./sf2-webaudio-renderer.js";
import { renderSF2NoteWorklet } from "./sf2-worklet-renderer.js";

/** Hard cap on the release tail that is rendered past the note-off. */
const SF2_MAX_TAIL_SECONDS = 30;

/**
 * Streaming: chunk length, how much is pre-rendered, and how far ahead we keep
 * the queue.
 *
 * The chunk is deliberately short. Note-on and every catch-up render a whole
 * number of chunks on the main thread, so the chunk length is the granularity
 * at which this engine blocks: with 1 s chunks a single strings voice cost
 * ~0.9 ms per chunk and a 6 note pad started by rendering 3 s each (~25 ms of
 * main thread, one or two dropped frames). At 0.25 s a render slice can also be
 * stopped between chunks without overrunning the budget.
 */
const SF2_STREAM_CHUNK_SECONDS = 0.25;
/**
 * How much audio is synthesized synchronously at note-on. It has to cover the
 * gap between "the note is handed to Web Audio" and "the pump has filled the
 * queue", not the note's start time (a chunk is scheduled at an absolute time,
 * so it does not matter how far in the future that is).
 *
 * This used to be 0.5 s, i.e. two chunks in one blocking call, which measured
 * as 3.4 ms of main thread per note (p95 7.4 ms) on a 4x slowed down Chrome -
 * by far the largest remaining cost of a note-on, and the reason dense sections
 * dropped frames on slow machines. One chunk still leaves 250 ms of queued
 * audio before the first pump slice can matter, and the pump starts ~3 ms later.
 */
const SF2_STREAM_LEAD_SECONDS = 0.25;
// A hidden tab throttles setTimeout (background timers can be delayed by
// seconds), so keep a bit more audio queued than the pump interval needs.
const SF2_STREAM_LOOKAHEAD_SECONDS = 2;
const SF2_STREAM_PUMP_MS = 200;
/**
 * How long a single top-up may block, in milliseconds. When the budget is spent
 * the pump yields and re-arms itself instead of rendering the whole backlog in
 * one burst (the old code rendered up to 32 chunks - 8 seconds of audio - in a
 * single go exactly when the main thread was already busy).
 */
const SF2_STREAM_BUDGET_MS = 4;
/**
 * Minimum gap between two top-ups, shared by every streaming note. Without it a
 * chord of N long notes puts N note-on top-ups back to back in the same task and
 * the per-note budget adds up to N x 4 ms.
 */
const SF2_STREAM_SLICE_GAP_MS = 3;

/** Chunks rendered before playback starts (rounded up, at least one). */
const SF2_STREAM_LEAD_CHUNKS = Math.max(1, Math.ceil(SF2_STREAM_LEAD_SECONDS / SF2_STREAM_CHUNK_SECONDS));

/**
 * Notes that are currently streaming (their remaining audio is still being
 * synthesized by a timer). Hosts can flush them, which synthesizes everything
 * that is left right away - used when timers become unreliable (background
 * tabs) so playback never runs out of queued audio.
 */
const activeStreamers = new Set();

/**
 * Earliest wall-clock time (performance.now()) at which any streamer may render
 * another slice. Shared by every note so the budget is a global one, not per
 * note: a chord's note-on fills happen one slice at a time instead of all in the
 * same task.
 */
let pumpNotBefore = 0;

export function flushSF2Streaming() {
    for (const streamer of [...activeStreamers]) streamer.flush();
    return activeStreamers.size;
}

/**
 * App level trim for the SF2 engine.
 *
 * The SoundFont gain itself is exactly TSF's (that is what makes the
 * instruments balance), but TSF's absolute level is far hotter than
 * PicoAudio's built-in sound modes: a note at velocity 100 peaks around 0.43
 * here versus ~0.09 for soundQuality 0/1/3, so a chord clipped immediately.
 * -12 dB puts SF2 back on the same scale as the other modes (and on the same
 * scale the previous Web Audio based renderer used), leaving TSF's relative
 * levels, envelopes and dynamics untouched.
 */
const SF2_OUTPUT_TRIM_DB = -12;
const SF2_OUTPUT_TRIM = Math.pow(10, SF2_OUTPUT_TRIM_DB / 20);

const PICO_GENERATE_VOLUME_REFERENCE = 0.15;

/**
 * One chunk scratch buffer shared by every streaming note.
 *
 * scheduleChunk() renders a chunk and copies it into the chunk's AudioBuffer
 * before it returns, so nothing keeps a reference to the scratch - a single
 * buffer is enough. Allocating one per note instead cost a 1 second (352 KB)
 * Float32Array per note, which at GeneralUser density (~50 note-ons/s) is
 * ~17 MB/s of garbage on top of the chunk buffers themselves; that showed up
 * as recurring 40-80 ms main thread pauses (measured with
 * scripts/browser-bench.mjs --page=rt-profile).
 */
let streamScratch = null;

function getStreamScratch(frames) {
    const samples = frames * 2;
    if (!streamScratch || streamScratch.length < samples) streamScratch = new Float32Array(samples);
    return streamScratch;
}

/**
 * Free list of chunk AudioBuffers.
 *
 * Every chunk used to be a fresh AudioBuffer: 0.25 s of stereo float32 is
 * ~96 KB, and a dense song creates ~200 chunks per second, so the engine asked
 * Chrome to allocate and zero ~19 MB/s. That is memory bandwidth the audio
 * thread needs on a low end device, plus the garbage it leaves behind. A chunk
 * buffer is free again the moment its source ends (onended), so it goes back
 * into a small free list instead of to the GC.
 *
 * Buffers belong to the AudioContext that created them, so the pool is dropped
 * wholesale when a different context shows up.
 *
 * The cap is sized for the peak, not the average: a dense song keeps ~200
 * chunk sources playing at once, and anything the pool cannot serve is a fresh
 * allocation (and its garbage). With one size class and 16 MB the engine
 * allocates during the first seconds of a song and then recycles.
 */
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
    const frames = buffer.length;
    const bytes = frames * 8;
    if (!bytes || chunkPoolBytes + bytes > CHUNK_POOL_MAX_BYTES) return;
    let free = chunkPool.get(frames);
    if (!free) {
        free = [];
        chunkPool.set(frames, free);
    }
    free.push(buffer);
    chunkPoolBytes += bytes;
}

/**
 * Render a complete SF2 note into the audio graph.
 * Must be called with `this` = PicoAudio instance:
 *   renderSF2Note.call(this, option) -> () => void (stop function) | null
 */
export function renderSF2Note(option) {
    // Profiling switch, deliberately not part of the settings UI: hand the
    // player a no-op stop function without synthesizing anything, so a profile
    // of the main thread shows the event and scheduling side alone. A no-op
    // (rather than null) keeps the note registered exactly as a real one, so
    // the note bookkeeping, stop list and polyphony accounting all still run.
    // Used by test_samples/browser/rt-profile.mjs with ?norender=1.
    if (this.settings && this.settings.sf2NoRender) return () => {};

    const context = this.context;
    const font = getSF2Font();
    if (!font) return null;

    // 'webaudio' hands the synthesis to native nodes instead of the JavaScript
    // sample loop (same region/envelope/gain data, see sf2-webaudio-renderer.js).
    if (this.settings && this.settings.sf2Engine === 'webaudio') {
        return renderSF2NoteWebAudio.call(this, option);
    }

    // 'worklet' runs this very implementation inside an AudioWorklet (one node
    // for the whole song, no per-voice graph). While the module is still
    // loading - and for offline rendering, which is not realtime constrained -
    // it returns null and the note is rendered here instead.
    if (this.settings && this.settings.sf2Engine === 'worklet') {
        const stopWorklet = renderSF2NoteWorklet.call(this, option);
        if (stopWorklet) return stopWorklet;
    }

    // Sound quality: the optional DSP stages are chosen when the voices are set
    // up, so the preset has to be applied before the note starts rendering.
    applySF2Quality(tsfQuality, this.settings);

    const songStartTime = this.states && this.states.startTime ? this.states.startTime : 0;
    const baseLatency = this.baseLatency || 0;

    const start = option.startTime + songStartTime + baseLatency;
    const stop = option.stopTime + songStartTime + baseLatency;
    const isDrum = option.isDrum === true || option.channel === 9;

    // TinySoundFont plays the note-on velocity at face value; option.midiVelocity
    // is the raw MIDI byte (option.velocity also carries the channel volume).
    const velocity = Math.max(0, Math.min(127, Math.round(
        Number.isFinite(option.midiVelocity) ? option.midiVelocity
            : (Number.isFinite(option.velocity) ? option.velocity : 1) * 127
    )));
    // MIDI note-on with velocity zero is a note-off and must not sound.
    if (velocity === 0) return null;

    const presetIndex = getSF2PresetIndex(option.instrument, isDrum, option.bank || 0, option.pitch, velocity);
    if (presetIndex < 0) return null;

    const sampleRate = context.sampleRate || 44100;
    // Sample interpolation: 'linear' (default, matches TinySoundFont),
    // 'nearest' (lightest) or 'cubic' (smoothest).
    const interpolation = resolveInterpolation(resolveSF2Interpolation(this.settings));
    const noteFrames = Math.max(1, Math.round((stop - start) * sampleRate));
    const maxFrames = noteFrames + Math.round(SF2_MAX_TAIL_SECONDS * sampleRate);

    // Pitch bend is baked into the synthesis (TSF applies channel pitch wheel
    // to the voices), so the rendered buffer needs no playbackRate automation.
    const pitchBends = (option.pitchBend && option.pitchBend.length
        ? option.pitchBend.map((p) => ({
            frame: Math.max(0, Math.round(((p.time + songStartTime + baseLatency) - start) * sampleRate)),
            value: p.value,
        })).sort((a, b) => a.frame - b.frame)
        : null);

    // Channel pan (CC10) is a channel level offset on top of the region pan,
    // exactly like tsf_channel_setup_voice / tsf_channel_set_pan.
    const panChanges = (option.pan && option.pan.length
        ? option.pan.map((p) => ({
            frame: Math.max(0, Math.round(((p.time + songStartTime + baseLatency) - start) * sampleRate)),
            value: (p.value << 7) / 16383,
        })).sort((a, b) => a.frame - b.frame)
        : null);

    // Output level: application volume x channel volume.
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

    // Channel volume / expression follow the reference: the CC7 and CC11
    // values are multiplied and cubed (tsf_channel_midi_control ->
    // tsf_channel_set_volume), and a channel that never received CC7 stays at
    // full scale instead of being attenuated.
    const midiVolume = (Number.isFinite(option.midiVolume) ? option.midiVolume : 127) / 127;
    const midiExpression = Number.isFinite(option.midiExpression) ? option.midiExpression : 127;
    const channelGain = (expression01) => Math.pow(midiVolume * expression01, 3);

    // Output level, as a step curve the note's own samples carry.
    //
    // This used to be a GainNode per note holding the application output
    // controls and the CC11 expression curve. The samples are copied one by one
    // into the chunk buffer anyway, so the same curve is applied there: one
    // node less for every note (which is what a dense song allocates thousands
    // of times a second), no AudioParam automation, and the same stepwise shape
    // the AudioParam calls produced.
    //
    // expression is pre-expanded by the SMF parser, which pushes CC11 in file
    // order, so the frames below are already ascending.
    const expression = option.expression && option.expression.length ? option.expression : null;
    const initialExpression = expression ? expression[0].value / 127 : midiExpression / 127;
    const gainPoints = [{ frame: 0, gain: userGain * channelGain(initialExpression) }];
    if (expression) {
        expression.forEach((point) => {
            const time = Math.max(0, point.time + songStartTime + baseLatency);
            gainPoints.push({
                frame: Math.max(0, Math.round((time - start) * sampleRate)),
                gain: userGain * channelGain(point.value / 127),
            });
        });
    }
    let gainIndex = 0;
    let gainNow = gainPoints[0].gain;

    const outputNode = this.masterGainNode || context.destination;

    // --- synthesis, one chunk at a time ---------------------------------
    // tsf_note_on at frame 0, tsf_note_off at noteFrames, render until the
    // voices die or the tail cap is reached.
    //
    // There is no whole-note render any more. A note carries up to
    // SF2_MAX_TAIL_SECONDS of release, so rendering it in one go is ~10 MB of
    // stereo buffer and a main-thread stall of hundreds of ms; the only thing
    // that ever wanted it was the offline case, and offline can drain the same
    // chunks instead of asking for a different size. So: one chunk size, one
    // code path, and the only thing that differs between realtime and offline
    // is who drives the loop (see the priming block below).
    const isOffline = typeof OfflineAudioContext !== 'undefined' && context instanceof OfflineAudioContext;
    const chunkFrames = Math.max(1024, Math.round(SF2_STREAM_CHUNK_SECONDS * sampleRate));
    const renderer = createNoteRenderer(
        font, presetIndex, option.pitch, velocity / 127, noteFrames, maxFrames, pitchBends, panChanges, interpolation);

    const sources = [];
    let scheduledFrames = 0;
    let stopped = false;
    let timer = null;

    function scheduleChunk() {
        if (stopped) return false;
        const scratch = getStreamScratch(chunkFrames);
        const written = renderer.render(chunkFrames, scratch);
        if (!written) return false;
        const data = scratch;

        // Every streaming chunk is a full length buffer, even the one that ends
        // a note. A 0.25 s chunk is always the same size; a note's last chunk is
        // a random shorter one, and since the free list is keyed by length those
        // tails both missed it and filled it with buffers nothing could use. So
        // the pool never served anything: test_samples/browser/soak.mjs measured
        // 120-170 KB of AudioBuffer allocated per note (4 GB per 10 minutes of a
        // dense song) with 36 distinct chunk lengths. Rounding the tails up puts
        // the whole engine on one size class - the same song now allocates 14 KB
        // per note, all of it while the pool is still filling. The extra frames
        // are silence.
        const buffer = takeChunkBuffer(context, chunkFrames, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        // Apply the note's output/expression curve while copying. Stepwise, in
        // note frames, exactly like the AudioParam calls it replaces.
        let frame = scheduledFrames;
        for (let i = 0, j = 0; i < written; i++, frame++) {
            while (gainIndex + 1 < gainPoints.length && gainPoints[gainIndex + 1].frame <= frame) {
                gainIndex++;
                gainNow = gainPoints[gainIndex].gain;
            }
            left[i] = data[j++] * gainNow;
            right[i] = data[j++] * gainNow;
        }
        if (written < chunkFrames) {
            // the reused buffer still holds the previous chunk's samples
            left.fill(0, written);
            right.fill(0, written);
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(outputNode);
        // The chunk buffer goes back into the pool once nothing plays it any
        // more; the note has no other node to release, the source is the whole
        // of its output stage.
        const isLastChunk = renderer.isDone();
        source.onended = () => {
            // disconnect() takes the source out of the graph, which is what
            // frees it (and its buffer). Assigning null to source.buffer is not
            // supported by Chrome and warns once per chunk.
            try { source.disconnect(); } catch (e) { /* noop */ }
            releaseChunkBuffer(buffer);
            if (isLastChunk && !stopped) {
                activeStreamers.delete(streamer);
            }
        };
        try {
            source.start(start + scheduledFrames / sampleRate);
        } catch (e) {
            try {
                source.start();
            } catch (e2) {
                try { source.disconnect(); } catch (e3) { /* noop */ }
                return false;
            }
        }
        sources.push(source);
        scheduledFrames += written;
        return true;
    }

    const pump = () => {
        timer = null;
        if (stopped) return;
        // Other notes may have just topped up. Yield so a chord does not stack
        // its per-note budgets into one task / one dropped frame.
        const now = performance.now();
        if (now < pumpNotBefore) {
            timer = setTimeout(pump, Math.ceil(pumpNotBefore - now));
            return;
        }
        const deadline = now + SF2_STREAM_BUDGET_MS;
        while (!renderer.isDone()
            && start + scheduledFrames / sampleRate < context.currentTime + SF2_STREAM_LOOKAHEAD_SECONDS
            && performance.now() < deadline) {
            if (!scheduleChunk()) return;
        }
        pumpNotBefore = performance.now() + SF2_STREAM_SLICE_GAP_MS;
        if (renderer.isDone()) { activeStreamers.delete(streamer); return; }
        // Still short of the lookahead: come back as soon as the slice gap has
        // passed instead of waiting for the next regular pump.
        const filled = start + scheduledFrames / sampleRate >= context.currentTime + SF2_STREAM_LOOKAHEAD_SECONDS;
        timer = setTimeout(pump, filled ? SF2_STREAM_PUMP_MS : 0);
    };

    // Registered so a host can finish the note immediately when timers become
    // unreliable (hidden tab) instead of risking a gap in the middle of it.
    const streamer = {
        flush() {
            if (stopped) return;
            if (timer !== null) { clearTimeout(timer); timer = null; }
            while (!renderer.isDone()) {
                if (!scheduleChunk()) break;
            }
            activeStreamers.delete(streamer);
        },
    };

    if (isOffline) {
        // Offline: there is no clock to come back on, and startRendering()
        // renders the graph in one go after this call returns, so every chunk
        // has to be scheduled now. Still the same chunks, just drained.
        while (!renderer.isDone()) {
            if (!scheduleChunk()) break;
        }
    } else {
        activeStreamers.add(streamer);
        // Bounded start-up cost: only the first chunks are synthesized now.
        for (let i = 0; i < SF2_STREAM_LEAD_CHUNKS && !renderer.isDone(); i++) {
            if (!scheduleChunk()) break;
        }
        if (!renderer.isDone()) {
            // Fill up to the lookahead right away, in budgeted slices.
            pumpNotBefore = performance.now() + SF2_STREAM_SLICE_GAP_MS;
            timer = setTimeout(pump, 0);
        }
    }

    if (sources.length === 0) {
        return null;
    }

    // The rendered chunks already contain the release, so there is nothing to
    // schedule at note-off; this is the universal mute for the stop manager
    // (song stop / note stealing) plus cancelling any pending synthesis.
    // Stopping the sources is the mute: the note has no gain stage of its own
    // any more, and a buffer source stops at the scheduled time, so this is as
    // immediate as cancelling an AudioParam and needs no node.
    return () => {
        stopped = true;
        if (timer !== null) { clearTimeout(timer); timer = null; }
        activeStreamers.delete(streamer);
        for (const source of sources) {
            try { source.stop(); } catch (e) { /* noop */ }
            try { source.disconnect(); } catch (e) { /* noop */ }
        }
        sources.length = 0;
    };
}

export default { renderSF2Note, flushSF2Streaming };
