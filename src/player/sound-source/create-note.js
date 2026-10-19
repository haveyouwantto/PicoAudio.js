import { renderSF2Note } from "./sf2-renderer";
import { HAS_SF2, HAS_WAVE } from "../../features.js";
import { resolveSoundQuality } from "../sound-quality.js";
import createSynthInstrumentNote, { hasSynthInstrument } from "./synth-instruments";

export default function createNote(option) {
    // Sound quality 1 is the hand-programmed synth engine. Every GM program
    // has a patch; an unknown program falls back to the basic waveform mode.
    if (HAS_WAVE && this.settings.soundQuality == 1) {
        if (hasSynthInstrument(option.instrument)) {
            return createSynthInstrumentNote.call(this, option);
        }
    }

    let quality = resolveSoundQuality(this.settings);
    if (quality == 1) quality = 0;
    // SF2 SoundFont mode: the renderer builds its own complete audio graph
    // (zone/layer selection, envelope, filters, LFOs), so we bypass
    // createBaseNote entirely to avoid creating a bare BufferSource.
    if (HAS_SF2 && quality == 4) {
        return renderSF2Note.call(this, option);
    }

    const note = this.createBaseNote(option, false, true, false, true, false);
    if (note.isGainValueZero) return null;

    const oscillator = note.oscillator;
    const gainNode = note.gainNode;
    const stopGainNode = note.stopGainNode;
    let isPizzicato = false;
    let isNoiseCut = false;

    let note2;

    // 音色の設定 //
    gainNode.gain.value *= this.settings.instrumentAttenuation;  // Instrument volume attenuation

    switch (quality) {
        case 0:
            switch (this.channels[note.channel][0] * 1000 || option.instrument) {
                // Sine
                case 1000:
                case 6: case 15: case 24: case 26: case 46: case 50: case 51:
                case 52: case 53: case 54: case 82: case 85: case 86:
                    {
                        oscillator.type = "sine";
                        gainNode.gain.value *= 1.5;
                        break;
                    }
                // Square
                case 2000:
                case 4: case 12: case 13: case 16: case 19: case 20: case 32: case 34: case 45: case 48: case 49:
                case 55: case 56: case 57: case 61: case 62: case 63: case 71: case 72: case 73: case 74: case 75:
                case 76: case 77: case 78: case 79: case 80: case 84:
                    {
                        oscillator.type = "square";
                        gainNode.gain.value *= 0.8;
                        break;
                    }
                // Sawtooth
                case 3000:
                case 0: case 1: case 2: case 3: case 7: case 17: case 18: case 21: case 22: case 23: case 27:
                case 28: case 29: case 30: case 36: case 37: case 38: case 39: case 40: case 41: case 42: case 43:
                case 44: case 47: case 59: case 64: case 65: case 66: case 67: case 68: case 69: case 70: case 87:
                    {
                        oscillator.type = "sawtooth";
                        break;
                    }
                // Triangle
                case 4000:
                case 8: case 9: case 10: case 11: case 14: case 25: case 31: case 33: case 35: case 58: case 60:
                case 83: case 88: case 89: case 90: case 91: case 92: case 93: case 94: case 95:
                    {
                        oscillator.type = "triangle";
                        gainNode.gain.value *= 1.5;
                        break;
                    }
                // Other - Square
                default: {
                    oscillator.type = "square";
                }
            }
            break;

        case 4: {
            // SF2 SoundFont sample playback — delegated to sf2-renderer.js.
            // (createNote short-circuits above for soundQuality=4, this is a
            // defensive fallback for direct calls.)
            if (!HAS_SF2) break;
            return renderSF2Note.call(this, option);
        }
    }

    // 音の終わりのプチプチノイズが気になるので、音の終わりに5ms減衰してノイズ軽減 //
    // Only applies to the basic oscillator path (synth and SF2 return above).
    if ((oscillator.type == "sine" || oscillator.type == "triangle")
        && !isPizzicato && note.stop - note.start > 0.01) {
        isNoiseCut = true;
    }

    // 減衰の設定 //
    switch (quality) {
        case 0:
            switch (this.channels[note.channel][1] / 10 || option.instrument) {
                // ピッチカート系減衰
                case 0.2:
                case 12: case 13: case 45: case 55:
                    {
                        isPizzicato = true;
                        gainNode.gain.value *= 1.1;
                        gainNode.gain.setValueAtTime(gainNode.gain.value, note.start);
                        gainNode.gain.linearRampToValueAtTime(0.0, note.start + 0.2);
                        this.stopAudioNode(oscillator, note.start + 0.2, stopGainNode);
                        break;
                    }
                // ピアノ程度に伸ばす系
                case 0.3:
                case 0: case 1: case 2: case 3: case 6: case 9: case 11: case 14: case 15:
                case 32: case 36: case 37: case 46: case 47:
                    {
                        gainNode.gain.value *= 1.1;
                        const decay = (128 - option.pitch) / 128;
                        gainNode.gain.setValueAtTime(gainNode.gain.value, note.start);
                        gainNode.gain.linearRampToValueAtTime(gainNode.gain.value * 0.85, note.start + decay * decay / 8);
                        gainNode.gain.linearRampToValueAtTime(gainNode.gain.value * 0.8, note.start + decay * decay / 4);
                        gainNode.gain.setTargetAtTime(0, note.start + decay * decay / 4, 5 * decay * decay);
                        this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut);
                        break;
                    }
                // ギター系
                case 0.4:
                case 24: case 25: case 26: case 27: case 28: case 29: case 30: case 31: case 34:
                    {
                        gainNode.gain.value *= 1.1;
                        gainNode.gain.setValueAtTime(gainNode.gain.value, note.start);
                        gainNode.gain.linearRampToValueAtTime(0.0, note.start + 1.0 + note.velocity * 4);
                        this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut);
                        break;
                    }
                // 減衰していくけど終わらない系
                case 0.5:
                case 4: case 5: case 7: case 8: case 10: case 33: case 35:
                    {
                        gainNode.gain.value *= 1.0;
                        gainNode.gain.setValueAtTime(gainNode.gain.value, note.start);
                        gainNode.gain.linearRampToValueAtTime(gainNode.gain.value * 0.95, note.start + 0.1);
                        gainNode.gain.setValueAtTime(gainNode.gain.value * 0.95, note.start + 0.1);
                        gainNode.gain.linearRampToValueAtTime(0.0, note.start + 2.0 + note.velocity * 10);
                        this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut);
                        break;
                    }
                case 119: // Reverse Cymbal
                    {
                        gainNode.gain.value = 0;
                        this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut);
                        note2 = this.createBaseNote(option, true, true);
                        if (note2.isGainValueZero) break;
                        note2.oscillator.playbackRate.setValueAtTime((option.pitch + 1) / 128, note.start);
                        note2.gainNode.gain.setValueAtTime(0, note.start);
                        note2.gainNode.gain.linearRampToValueAtTime(1.3, note.start + 2);
                        this.stopAudioNode(note2.oscillator, note.stop, note2.stopGainNode);
                        break;
                    }
                default: {
                    gainNode.gain.value *= 1.1;
                    gainNode.gain.setValueAtTime(gainNode.gain.value, note.start);
                    this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut);
                }
            }
            break;
        case 4: {
            // SF2 envelope scheduling now lives in sf2-renderer.js.
            // This case is unreachable for soundQuality=4 (short-circuited above),
            // kept only as a safe no-op fallback.
            if (!HAS_SF2) break;
            break;
        }
    }

    // 音をストップさせる関数を返す //
    return () => {
        this.stopAudioNode(oscillator, 0, stopGainNode, true);
        if (note2 && note2.oscillator) this.stopAudioNode(note2.oscillator, 0, note2.stopGainNode, true);
    };
}
