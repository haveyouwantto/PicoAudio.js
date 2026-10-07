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
import { createNoteRenderer, resolveInterpolation } from "../sf2/tsf-synth.js";

/** Hard cap on the release tail that is rendered past the note-off. */
const SF2_MAX_TAIL_SECONDS = 30;

/** Streaming: chunk length, how much is pre-rendered, and how far ahead we keep the queue. */
const SF2_STREAM_CHUNK_SECONDS = 1;
// A hidden tab throttles setTimeout (background timers can be delayed by
// seconds), so keep a bit more audio queued than the pump interval needs.
const SF2_STREAM_LEAD_CHUNKS = 3;
const SF2_STREAM_LOOKAHEAD_SECONDS = 2;
const SF2_STREAM_PUMP_MS = 200;
const SF2_STREAM_MAX_CHUNKS_PER_PUMP = 4;
/** When the queue has fallen behind, synthesize this many chunks in one go. */
const SF2_STREAM_CATCHUP_CHUNKS = 32;

/**
 * Notes that are currently streaming (their remaining audio is still being
 * synthesized by a timer). Hosts can flush them, which synthesizes everything
 * that is left right away - used when timers become unreliable (background
 * tabs) so playback never runs out of queued audio.
 */
const activeStreamers = new Set();

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
 * Render a complete SF2 note into the audio graph.
 * Must be called with `this` = PicoAudio instance:
 *   renderSF2Note.call(this, option) -> () => void (stop function) | null
 */
export function renderSF2Note(option) {
    const context = this.context;
    const font = getSF2Font();
    if (!font) return null;

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
    const interpolation = resolveInterpolation(this.settings && this.settings.sf2Interpolation);
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
    const scratch = streaming ? new Float32Array(chunkFrames * 2) : null;

    const renderer = createNoteRenderer(
        font, presetIndex, option.pitch, velocity / 127, noteFrames, maxFrames, pitchBends, panChanges, interpolation);

    const sources = [];
    let scheduledFrames = 0;
    let stopped = false;
    let timer = null;

    const scheduleChunk = () => {
        if (stopped) return false;
        const first = renderer.frames;
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
        source.onended = () => {
            try { source.disconnect(); source.buffer = null; } catch (e) { /* noop */ }
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
    };

    const pump = () => {
        timer = null;
        if (stopped) return;
        const scheduledUntil = start + scheduledFrames / sampleRate;
        // If the playhead has caught up with the queue (the main thread was
        // busy, or the tab was throttled) refill it in one bigger burst.
        let budget = scheduledUntil <= context.currentTime
            ? SF2_STREAM_CATCHUP_CHUNKS
            : SF2_STREAM_MAX_CHUNKS_PER_PUMP;
        while (budget-- > 0 && !renderer.isDone()
            && start + scheduledFrames / sampleRate < context.currentTime + SF2_STREAM_LOOKAHEAD_SECONDS) {
            if (!scheduleChunk()) return;
        }
        if (renderer.isDone()) { activeStreamers.delete(streamer); return; }
        timer = setTimeout(pump, SF2_STREAM_PUMP_MS);
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
        if (!renderer.isDone()) timer = setTimeout(pump, SF2_STREAM_PUMP_MS);
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
