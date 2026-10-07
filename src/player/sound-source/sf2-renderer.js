/**
 * SF2 Renderer — TinySoundFont port edition
 *
 * A note is synthesized offline by the ported TinySoundFont renderer
 * (player/sf2/tsf-synth.js) into stereo PCM, then played through a
 * BufferSourceNode. That means the whole signal path — region selection,
 * envelope, filter, LFOs, looping, pan and gain — is the reference
 * implementation's, so the output matches TinySoundFont sample for sample
 * instead of approximating it with a Web Audio node graph.
 *
 * The only things added on top are the ones the application needs and TSF has
 * no concept of: the pre-scheduled pitch bend / expression automation of
 * PicoAudio's note objects, the user volume, and a universal mute for the
 * stop manager.
 */

import { getSF2Font, getSF2PresetIndex } from "./sf2-provider.js";

/** Hard cap on the release tail that is rendered past the note-off. */
const SF2_MAX_TAIL_SECONDS = 30;

/**
 * App level trim. The SoundFont gain itself is exactly TSF's, this is only a
 * master volume for PicoAudio's mixer; lower it if a dense song clips.
 */
const SF2_OUTPUT_TRIM = 1.0;

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

    const velocity = Math.max(0, Math.min(127, Math.round(
        (Number.isFinite(option.velocity) ? option.velocity : 1) * 127
    )));
    // MIDI note-on with velocity zero is a note-off and must not sound.
    if (velocity === 0) return null;

    const presetIndex = getSF2PresetIndex(option.instrument, isDrum, option.bank || 0);
    if (presetIndex < 0) return null;

    const sampleRate = context.sampleRate || 44100;
    const noteFrames = Math.max(1, Math.round((stop - start) * sampleRate));
    const maxFrames = noteFrames + Math.round(SF2_MAX_TAIL_SECONDS * sampleRate);

    // tsf_note_on at frame 0, tsf_note_off at noteFrames, render until the
    // voices die or the tail cap is reached.
    const rendered = font.renderNote(presetIndex, option.pitch, velocity / 127, noteFrames, maxFrames);
    if (!rendered.frames) return null;

    const buffer = context.createBuffer(2, rendered.frames, sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const data = rendered.data;
    for (let i = 0, j = 0; i < rendered.frames; i++) {
        left[i] = data[j++];
        right[i] = data[j++];
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    // --- pitch bend: scheduled playbackRate changes (same as before) ---
    if (option.pitchBend && option.pitchBend.length) {
        option.pitchBend.forEach((p) => {
            const t = Math.max(0, p.time + songStartTime + baseLatency);
            source.playbackRate.setValueAtTime(Math.pow(2, p.value / 12), t);
        });
    }

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
    const outputGain = Math.max(0, SF2_OUTPUT_TRIM
        * (configuredGenerateVolume / PICO_GENERATE_VOLUME_REFERENCE)
        * channelVolume);

    const performanceGain = context.createGain();
    const expression = option.expression && option.expression.length ? option.expression : null;
    const initialExpression = expression ? expression[0].value / 127 : 100 / 127;
    performanceGain.gain.setValueAtTime(outputGain * initialExpression, start);
    if (expression) {
        expression.forEach((point) => {
            const time = Math.max(0, point.time + songStartTime + baseLatency);
            performanceGain.gain.setValueAtTime(outputGain * (point.value / 127), time);
        });
    }

    source.connect(performanceGain);
    performanceGain.connect(stopGainNode);

    try {
        source.start(start);
    } catch (e) {
        try {
            source.start();
        } catch (e2) {
            console.warn('SF2: failed to start source', e2);
            try { source.disconnect(); performanceGain.disconnect(); stopGainNode.disconnect(); } catch (e3) { /* noop */ }
            return null;
        }
    }

    // The rendered buffer already contains the release, so there is nothing to
    // schedule at note-off; this is only the universal mute for the stop
    // manager (song stop / note stealing).
    return () => {
        try { stopGainNode.gain.setValueAtTime(0, context.currentTime); } catch (e) { /* noop */ }
        try { source.stop(); } catch (e) { /* noop */ }
        try { source.disconnect(); } catch (e) { /* noop */ }
        try { performanceGain.disconnect(); } catch (e) { /* noop */ }
        try { stopGainNode.disconnect(); } catch (e) { /* noop */ }
    };
}

export default { renderSF2Note };
