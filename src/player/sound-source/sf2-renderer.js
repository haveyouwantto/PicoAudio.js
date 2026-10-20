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
 * main thread, one or two dropped frames). At 0.25 s the same note-on renders
 * 0.5 s - four times less work per block, and small enough that a render slice
 * can be stopped between chunks without overrunning the budget.
 */
const SF2_STREAM_CHUNK_SECONDS = 0.25;
/** How much audio is synthesized synchronously at note-on (must cover the note's start time). */
const SF2_STREAM_LEAD_SECONDS = 0.5;
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
 * Render a complete SF2 note into the audio graph.
 * Must be called with `this` = PicoAudio instance:
 *   renderSF2Note.call(this, option) -> () => void (stop function) | null
 */
export function renderSF2Note(option) {
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

    // Shared stop gain: every note has exactly one universal mute.
    const stopGainNode = context.createGain();
    stopGainNode.gain.value = 1;
    if (this.masterGainNode) {
        stopGainNode.connect(this.masterGainNode);
    } else if (context.destination) {
        stopGainNode.connect(context.destination);
    }

    // Keep application output controls separate from the sampled note so
    // expression (CC11, pre-expanded by PicoAudio) scales the complete voice.
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

    // --- synthesis, one chunk at a time ---------------------------------
    // tsf_note_on at frame 0, tsf_note_off at noteFrames, render until the
    // voices die or the tail cap is reached.
    const isOffline = typeof OfflineAudioContext !== 'undefined' && context instanceof OfflineAudioContext;
    const streaming = !isOffline && !(this.settings && this.settings.sf2Streaming === false);
    const chunkFrames = streaming
        ? Math.max(1024, Math.round(SF2_STREAM_CHUNK_SECONDS * sampleRate))
        : maxFrames;
    const renderer = createNoteRenderer(
        font, presetIndex, option.pitch, velocity / 127, noteFrames, maxFrames, pitchBends, panChanges, interpolation);

    const sources = [];
    let scheduledFrames = 0;
    let stopped = false;
    let timer = null;

    // Per note nodes have to leave the graph when the note is over. Notes that
    // end on their own are only removed from the player's stop list - their
    // stop function is never called - so without this the mixer would keep two
    // GainNodes per note forever (measured: 2269 live nodes after 1134 notes).
    const releaseGraph = () => {
        try { performanceGain.disconnect(); } catch (e) { /* noop */ }
        try { stopGainNode.disconnect(); } catch (e) { /* noop */ }
    };

    function scheduleChunk() {
        if (stopped) return false;
        const first = renderer.frames;
        const scratch = streaming ? getStreamScratch(chunkFrames) : null;
        const written = renderer.render(chunkFrames, scratch);
        if (!written) return false;
        const data = scratch
            ? scratch
            : renderer.buffer.subarray(first * 2, (first + written) * 2);

        const buffer = context.createBuffer(2, written, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        for (let i = 0, j = 0; i < written; i++) {
            left[i] = data[j++];
            right[i] = data[j++];
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(performanceGain);
        // The chunk that finishes the note also tears the note's graph down:
        // notes that end on their own never get their stop function called, so
        // without this two GainNodes per note would stay in the mixer forever.
        const isLastChunk = renderer.isDone();
        source.onended = () => {
            try { source.disconnect(); source.buffer = null; } catch (e) { /* noop */ }
            if (isLastChunk && !stopped) {
                releaseGraph();
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

    if (streaming) {
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
    } else {
        // Offline rendering: everything must be scheduled before startRendering().
        while (!renderer.isDone()) {
            if (!scheduleChunk()) break;
        }
    }

    if (sources.length === 0) {
        try { performanceGain.disconnect(); stopGainNode.disconnect(); } catch (e) { /* noop */ }
        return null;
    }

    // The rendered chunks already contain the release, so there is nothing to
    // schedule at note-off; this is the universal mute for the stop manager
    // (song stop / note stealing) plus cancelling any pending synthesis.
    return () => {
        stopped = true;
        if (timer !== null) { clearTimeout(timer); timer = null; }
        activeStreamers.delete(streamer);
        try { stopGainNode.gain.setValueAtTime(0, context.currentTime); } catch (e) { /* noop */ }
        for (const source of sources) {
            try { source.stop(); } catch (e) { /* noop */ }
            try { source.disconnect(); } catch (e) { /* noop */ }
        }
        sources.length = 0;
        try { performanceGain.disconnect(); } catch (e) { /* noop */ }
        try { stopGainNode.disconnect(); } catch (e) { /* noop */ }
    };
}

export default { renderSF2Note, flushSF2Streaming };
