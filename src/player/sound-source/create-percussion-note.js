import { renderSF2Note } from "./sf2-renderer";
import { HAS_SF2 } from "../../features.js";
import { resolveSoundQuality } from "../sound-quality.js";
import createSynthKitNote from "./percussion-kit";

export default function createPercussionNote(option) {
    const quality = resolveSoundQuality(this.settings);
    // SF2 SoundFont mode: delegated to sf2-renderer.js (same graph as melodic).
    if (HAS_SF2 && quality == 4) {
        return renderSF2Note.call(this, { ...option, isDrum: true });
    }

    // Sound quality 1: synthesised kit, built in percussion-kit.js (one base note per drum).
    if (quality == 1) {
        return createSynthKitNote.call(this, option);
    }

    const needsFilter = (quality == -1) || (HAS_SF2 && quality == 4);
    const note = this.createBaseNote(option, true, false, false, false, needsFilter);
    if (note.isGainValueZero) return null;

    const source = note.oscillator;
    // if (this.settings.soundQuality != 3) source.buffer = this.whitenoise;
    const gainNode = note.gainNode;
    const stopGainNode = note.stopGainNode;
    const filter = note.filter;
    let start = note.start;
    const velocity = 1; // ドラム全体の音量調整用
    let note2 = this.createBaseNote(option, false, false, true, false, needsFilter);
    const oscillator = note2.oscillator;
    const gainNode2 = note2.gainNode;
    const stopGainNode2 = note2.stopGainNode;
    const nextSameNoteOnInterval = option.nextSameNoteOnInterval;


    // oscillator.frequency.setValueAtTime()がcurrentTimeより遅れると周波数設定がされないので対策
    if (start < this.context.currentTime) start = this.context.currentTime;
    let stopAudioTime = 0;
    let stopAudioTime2 = 0;
    switch (quality) {
        case 4:
            // SF2 SoundFont drum playback is handled by the top-level shortcut
            // (renderSF2Note). This case is a defensive fallback.
            if (!HAS_SF2) break;
            gainNode.gain.value = 0;
            gainNode2.gain.value = 0;
            stopAudioTime = 0.01;
            stopAudioTime2 = 0;
            break;
        default: {
            source.buffer = this.whitenoise;
            switch (option.pitch) {
                //  元々のパーカッション音源 //
                // Bass drum
                case 35:
                case 36:
                    // w
                    gainNode.gain.value = velocity * 0.6;
                    source.playbackRate.value = 0.02;
                    stopAudioTime = 0.07;
                    // s
                    gainNode2.gain.value = velocity * 1.1;
                    oscillator.frequency.setValueAtTime(120, start);
                    oscillator.frequency.linearRampToValueAtTime(50, start + 0.07);
                    stopAudioTime2 = 0.07;
                    break;
                // Snare
                case 38:
                case 40:
                    // w
                    source.playbackRate.value = 0.7;
                    stopAudioTime = 0.05;
                    // s
                    gainNode2.gain.setValueAtTime(velocity * 0.8, start);
                    gainNode2.gain.linearRampToValueAtTime(0.0, start + 0.05);
                    oscillator.frequency.setValueAtTime(300, start);
                    oscillator.frequency.linearRampToValueAtTime(200, start + 0.05);
                    stopAudioTime2 = 0.05;
                    break;
                // Toms
                case 41: case 43: case 45:
                case 47: case 48: case 50:
                    // w
                    source.playbackRate.value = 0.01;
                    stopAudioTime = 0.1;
                    // s
                    oscillator.type = "square";
                    gainNode2.gain.setValueAtTime(velocity, start);
                    gainNode2.gain.linearRampToValueAtTime(0.01, start + 0.1);
                    oscillator.frequency.setValueAtTime(150 + 20 * (option.pitch - 40), start);
                    oscillator.frequency.linearRampToValueAtTime(50 + 20 * (option.pitch - 40), start + 0.1);
                    stopAudioTime2 = 0.1;
                    break;
                // Close Hihat
                case 42:
                case 44:
                    source.playbackRate.value = 1.5;
                    stopAudioTime = 0.02;
                    stopAudioTime2 = 0;
                    break;
                // Open Hihat
                case 46:
                    source.playbackRate.value = 1.5;
                    stopAudioTime = 0.3;
                    gainNode.gain.setValueAtTime(velocity * 0.9, start);
                    gainNode.gain.linearRampToValueAtTime(0.0, start + 0.3);
                    stopAudioTime2 = 0;
                    break;
                // Cymbal
                case 49: case 52:
                case 53: case 55: case 57:
                    source.playbackRate.value = 1.2;
                    stopAudioTime = 0.5;
                    gainNode.gain.setValueAtTime(velocity * 1, start);
                    gainNode.gain.linearRampToValueAtTime(0.0, start + 0.5);
                    stopAudioTime2 = 0;
                    break;
                // Cymbal2
                case 51:
                    source.playbackRate.value = 1.1;
                    stopAudioTime = 0.4;
                    gainNode.gain.setValueAtTime(velocity * 0.8, start);
                    gainNode.gain.linearRampToValueAtTime(0.0, start + 0.4);
                    stopAudioTime2 = 0;
                    break;
                // Cymbal3
                case 59:
                    source.playbackRate.value = 1.8;
                    stopAudioTime = 0.3;
                    gainNode.gain.setValueAtTime(velocity * 0.5, start);
                    gainNode.gain.linearRampToValueAtTime(0.0, start + 0.3);
                    stopAudioTime2 = 0;
                    break;
                // Bongo
                case 60: case 61:
                    // w
                    source.playbackRate.value = 0.03;
                    stopAudioTime = 0.03;
                    // s
                    gainNode2.gain.setValueAtTime(velocity * 0.8, start);
                    gainNode2.gain.linearRampToValueAtTime(0.0, start + 0.1);
                    oscillator.frequency.setValueAtTime(400 - 40 * (option.pitch - 60), start);
                    oscillator.frequency.linearRampToValueAtTime(450 - 40 * (option.pitch - 60), start + 0.1);
                    stopAudioTime2 = 0.1;
                    break;
                // mute Conga
                case 62:
                    // w
                    source.playbackRate.value = 0.03;
                    stopAudioTime = 0.03;
                    // s
                    gainNode2.gain.setValueAtTime(velocity, start);
                    gainNode2.gain.linearRampToValueAtTime(0.0, start + 0.03);
                    oscillator.frequency.setValueAtTime(200, start);
                    oscillator.frequency.linearRampToValueAtTime(250, start + 0.03);
                    stopAudioTime2 = 0.03;
                    break;
                // open Conga
                case 63: case 64:
                    // w
                    source.playbackRate.value = 0.03;
                    stopAudioTime = 0.03;
                    // s
                    gainNode2.gain.setValueAtTime(velocity, start);
                    gainNode2.gain.linearRampToValueAtTime(0.0, start + 0.1);
                    oscillator.frequency.setValueAtTime(200 - 30 * (option.pitch - 63), start);
                    oscillator.frequency.linearRampToValueAtTime(250 - 30 * (option.pitch - 63), start + 0.1);
                    stopAudioTime2 = 0.1;
                    break;
                // Cowbell, Claves
                case 56:
                case 75:
                    // w
                    source.playbackRate.value = 0.01;
                    stopAudioTime = 0.1;
                    // s
                    gainNode2.gain.setValueAtTime(velocity, start);
                    gainNode2.gain.linearRampToValueAtTime(0.0, start + 0.1);
                    oscillator.frequency.setValueAtTime(1000 + 48 * (option.pitch - 56), start);
                    stopAudioTime2 = 0.1;
                    break;
                // mute triangle
                case 80:
                    // w
                    source.playbackRate.value = 5;
                    gainNode.gain.setValueAtTime(velocity * 0.5, start);
                    gainNode.gain.linearRampToValueAtTime(0.0, start + 0.2);
                    stopAudioTime = 0.05;
                    // s
                    oscillator.type = "triangle";
                    gainNode2.gain.setValueAtTime(velocity * 0.7, start);
                    gainNode2.gain.linearRampToValueAtTime(0.0, start + 0.2);
                    oscillator.frequency.setValueAtTime(6000, start);
                    stopAudioTime2 = 0.05;
                    break;
                // open triangle
                case 81:
                    // w
                    source.playbackRate.value = 5;
                    gainNode.gain.setValueAtTime(velocity * 0.9, start);
                    gainNode.gain.linearRampToValueAtTime(0.0, start + 0.5);
                    stopAudioTime = 0.5;
                    // s
                    oscillator.type = "triangle";
                    gainNode2.gain.setValueAtTime(velocity * 0.8, start);
                    gainNode2.gain.linearRampToValueAtTime(0.0, start + 0.3);
                    oscillator.frequency.setValueAtTime(6000, start);
                    stopAudioTime2 = 0.3;
                    break;

            }
        }

    }
    // 同じドラムの音が重ならないようにする機能
    // ドラム再生中に次の同じドラムがすぐ鳴る場合、次が鳴る前に止めて音が重ならないようにする（同時発音数の増加を軽減する）
    if (!this.settings.isSameDrumSoundOverlap && nextSameNoteOnInterval != -1) {
        if (stopAudioTime > nextSameNoteOnInterval) {
            stopAudioTime = nextSameNoteOnInterval;
        }
        if (stopAudioTime2 > nextSameNoteOnInterval) {
            stopAudioTime2 = nextSameNoteOnInterval;
        }
    }
    // ドラム音停止時間を設定
    this.stopAudioNode(source, start + stopAudioTime, stopGainNode);
    this.stopAudioNode(oscillator, start + stopAudioTime2, stopGainNode2);
    // ドラム停止時間を設定
    option.drumStopTime = option.startTime + (stopAudioTime >= stopAudioTime2 ? stopAudioTime : stopAudioTime2);

    // 音をストップさせる関数を返す //
    return () => {
        this.stopAudioNode(source, 0, stopGainNode, true);
        this.stopAudioNode(oscillator, 0, stopGainNode2, true);
    };
}
