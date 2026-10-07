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

    // tsf_note_on at frame 0, tsf_note_off at noteFrames, render until the
    // voices die or the tail cap is reached.
    const rendered = font.renderNote(
        presetIndex, option.pitch, velocity / 127, noteFrames, maxFrames, pitchBends, panChanges);
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
