import InterpolationUtil from "../../util/interpolation-util";
import { getWave, quickfadeArray, findClosestNumberIndex, getVolumeMul, vibrato } from "./periodic-wave-man";
import { getSample } from "./soundbank";

export default function createNote(option) {
    const isBuffer = this.settings.soundQuality == 3;
    const note = this.createBaseNote(option, isBuffer, true, false, true); // oscillatorのstopはこちらで実行するよう指定
    if (note.isGainValueZero) return null;

    const oscillators = note.oscillators;
    const gainNode = note.gainNode;
    const stopGainNode = note.stopGainNode;
    const filter = note.filter;
    let isPizzicato = false;
    let isNoiseCut = false;

    let note2;

    // 音色の設定 //
    gainNode.gain.value *= this.settings.instrumentAttenuation;  // Instrument volume attenuation

    switch (this.settings.soundQuality) {
        case -1:
            break;
        case 0:
            switch (this.channels[note.channel][0] * 1000 || option.instrument) {
                // Sine
                case 1000:
                case 6: case 15: case 24: case 26: case 46: case 50: case 51:
                case 52: case 53: case 54: case 82: case 85: case 86:
                    {
                        oscillators.forEach(osc => osc.type = "sine");
                        gainNode.gain.value *= 1.5;
                        break;
                    }
                // Square
                case 2000:
                case 4: case 12: case 13: case 16: case 19: case 20: case 32: case 34: case 45: case 48: case 49:
                case 55: case 56: case 57: case 61: case 62: case 63: case 71: case 72: case 73: case 74: case 75:
                case 76: case 77: case 78: case 79: case 80: case 84:
                    {
                        oscillators.forEach(osc => osc.type = "square");
                        gainNode.gain.value *= 0.8;
                        break;
                    }
                // Sawtooth
                case 3000:
                case 0: case 1: case 2: case 3: case 7: case 17: case 18: case 21: case 22: case 23: case 27:
                case 28: case 29: case 30: case 36: case 37: case 38: case 39: case 40: case 41: case 42: case 43:
                case 44: case 47: case 59: case 64: case 65: case 66: case 67: case 68: case 69: case 70: case 87:
                    {
                        oscillators.forEach(osc => osc.type = "sawtooth");
                        break;
                    }
                // Triangle
                case 4000:
                case 8: case 9: case 10: case 11: case 14: case 25: case 31: case 33: case 35: case 58: case 60:
                case 83: case 88: case 89: case 90: case 91: case 92: case 93: case 94: case 95:
                    {
                        oscillators.forEach(osc => osc.type = "triangle");
                        gainNode.gain.value *= 1.5;
                        break;
                    }
                // Other - Square
                default: {
                    oscillators.forEach(osc => osc.type = "square");
                }
            }
            break;

        case 1:
            oscillators.forEach((osc, i) => {
                let inst = getWave(this.context, option.instrument, findClosestNumberIndex(option.pitch), i);
                osc.setPeriodicWave(inst.wave);
            });
            break;

        case 3:
            oscillators.forEach(oscillator => {
                oscillator.loop = !quickfadeArray[option.instrument];
                const octave = findClosestNumberIndex(option.pitch);
                getSample(this.context, option.instrument, octave).then(sample => {
                    oscillator.buffer = sample;
                });
                const baseNote = 45 + octave * 12;
                oscillator.loopStart = 1;
                oscillator.basePitch = (option.pitch - baseNote) * 100;
                oscillator.detune.value = oscillator.basePitch;
            });
            break;
    }

    // 音の終わりのプチプチノイズが気になるので、音の終わりに5ms減衰してノイズ軽減 //
    if (oscillators[0] && (oscillators[0].type == "sine" || oscillators[0].type == "triangle")
        && !isPizzicato && note.stop - note.start > 0.01) {
        isNoiseCut = true;
    }

    // 減衰の設定 //
    switch (this.settings.soundQuality) {
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
                        oscillators.forEach(oscillator => this.stopAudioNode(oscillator, note.start + 0.2, stopGainNode));
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
                        oscillators.forEach(oscillator => this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut));
                        break;
                    }
                // ギター系
                case 0.4:
                case 24: case 25: case 26: case 27: case 28: case 29: case 30: case 31: case 34:
                    {
                        gainNode.gain.value *= 1.1;
                        gainNode.gain.setValueAtTime(gainNode.gain.value, note.start);
                        gainNode.gain.linearRampToValueAtTime(0.0, note.start + 1.0 + note.velocity * 4);
                        oscillators.forEach(oscillator => this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut));
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
                        oscillators.forEach(oscillator => this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut));
                        break;
                    }
                case 119: // Reverse Cymbal
                    {
                        gainNode.gain.value = 0;
                        oscillators.forEach(oscillator => this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut));
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
                    oscillators.forEach(oscillator => this.stopAudioNode(oscillator, note.stop, stopGainNode, isNoiseCut));
                }
            }
            break;
        case 1: {
            let inst = getWave(this.context, option.instrument, findClosestNumberIndex(option.pitch)); // Default wave for envelope data
            // Apply envelope to note
            let instEnvelope = inst.adsr;
            const attack = instEnvelope[0], decay = instEnvelope[1], sustain = instEnvelope[2], release = instEnvelope[3];
            const isPluck = quickfadeArray[option.instrument];
            let velocity = gainNode.gain.value * 1.3;
            const attackClamped = Math.max(attack, 0.001);

            // Setup vibrato effect
            try {
                let vibratoSample;
                const songStartTime = this.states.startTime;

                // If expression data exists (for dynamic vibrato)
                if (option.expression) {
                    const xArray = []; // Time points
                    const valueArray = []; // Vibrato strength values

                    // Prepare time and value arrays from expression data
                    option.expression.forEach(element => {
                        xArray.push(element.time - note.start + songStartTime);
                        valueArray.push(Math.pow(element.value / 127, 2)); // Convert MIDI value to strength
                    });

                    const vSamples = this.vibratoSamples;
                    const vLen = vSamples.length;
                    const sampleRate = this.context.sampleRate;
                    const instrumentVibrato = vibrato[option.instrument];
                    vibratoSample = new Float32Array(vLen);

                    let idx = 0;
                    const xLen = xArray.length;

                    for (let i = 0; i < vLen; i++) {
                        const t = (i / sampleRate) * 100;

                        // Find the right interval for linear interpolation
                        while (idx < xLen - 1 && xArray[idx + 1] <= t) {
                            idx++;
                        }

                        let strength;
                        if (idx >= xLen - 1) {
                            strength = valueArray[xLen - 1];
                        } else if (t < xArray[idx]) {
                            strength = valueArray[0];
                        } else {
                            const t0 = (t - xArray[idx]) / (xArray[idx + 1] - xArray[idx]);
                            strength = valueArray[idx] + (valueArray[idx + 1] - valueArray[idx]) * t0;
                        }

                        vibratoSample[i] = vSamples[i] * instrumentVibrato * strength;
                    }
                }
                // If no expression data (static vibrato)
                else {
                    // Use cached vibrato if available
                    if (this.vibratoCache[option.instrument]) {
                        vibratoSample = this.vibratoCache[option.instrument];
                    }
                    // Create new vibrato samples and cache them
                    else {
                        const vSamples = this.vibratoSamples;
                        const vLen = vSamples.length;
                        const instrumentVibrato = vibrato[option.instrument];
                        vibratoSample = new Float32Array(vLen);
                        for (let i = 0; i < vLen; i++) {
                            vibratoSample[i] = vSamples[i] * instrumentVibrato;
                        }
                        this.vibratoCache[option.instrument] = vibratoSample;
                    }
                }

                // Apply the vibrato effect to the oscillator
                oscillators.forEach(oscillator => {
                    oscillator.detune.setValueCurveAtTime(vibratoSample, note.start, 10);
                });
            } catch (e) {
                console.error(e); // Log any errors
            }

            gainNode.gain.setValueAtTime(0, note.start);
            // Attack phase
            if (isPluck) {
                velocity *= getVolumeMul(option.pitch)
            }
            gainNode.gain.setTargetAtTime(velocity, note.start, attackClamped / 3);

            // Decay phase

            if (isPluck) {
                const decayTime = Math.max(decay * 1.7 * Math.pow(2, (60 - option.pitch) / 18), 0.5);

                // 获取当前音符的基频和基础明亮度
                const pitchFreq = oscillator.frequency.value;
                const cutoffFreq = 492.35 * Math.exp(2.5 * option.velocity);

                const nyquist = this.context.sampleRate / 2;

                // 低频亮度补偿：低音弦在拨动时通常产生比例更高的瞬态分量。
                // 以 60 (C4) 为基点，每低 3 个八度补偿约 2 倍的倍率，让低音更“脆”。
                const pitchComp = Math.pow(2, (60 - option.pitch) / 36);

                // 初始阶段：必须足够高，包含完整的拨弦瞬态泛音
                // 应用亮度补偿 pitchComp
                const filterStart = Math.min(Math.max(pitchFreq * 4 * pitchComp, cutoffFreq * 1.5), nyquist);

                // 目标阶段：滤波器闭合的目标，不能过高（过高会导致失去滤波效果，像没加 filter），
                // 同时不能低于基频的 1.2 倍（防止高音被“吃”掉发闷）。
                const filterTarget = Math.min(Math.max(pitchFreq * 1.2, cutoffFreq * 0.05), nyquist);

                // 滤波器收敛速度：必须保持较快，产生“迅速消退的明亮感”。
                // 不能用 decay，否则低音衰减太慢，导致听感如同没加filter。
                const filterDecay = decayTime / 6;

                gainNode.gain.setTargetAtTime(0, note.start + attackClamped, decayTime / 2);
                filter.frequency.setValueAtTime(filterStart, note.start + attackClamped);
                filter.frequency.setTargetAtTime(filterTarget, note.start + attackClamped, filterDecay);
            } else {
                gainNode.gain.setTargetAtTime(velocity * sustain, note.start + attackClamped, decay / 2);

                if (option.expression) {
                    const songStartTime = this.states.startTime;
                    const baseLatency = this.baseLatency;
                    const pitchFreq = oscillator.frequency.value || 440;
                    const nyquist = this.context.sampleRate / 2;

                    // 将 Expression (CC11) 映射到滤波器截断频率
                    // 随着声音变大，滤波器开口也随之变大，使音色变亮
                    option.expression.forEach((p) => {
                        const t = Math.max(0, p.time + songStartTime + baseLatency);
                        const expScale = p.value / 127;

                        const baseCutoff = pitchFreq * 4;
                        const maxCutoff = Math.min(nyquist, 16000);
                        const targetFreq = baseCutoff + (maxCutoff - baseCutoff) * Math.pow(expScale, 4);

                        // 使用 setTargetAtTime 确保 expression point 之间有平滑过渡
                        filter.frequency.linearRampToValueAtTime(targetFreq, t);
                    });
                }
            }

            // Sustain phase (no explicit scheduling needed)

            // Release phase
            const releaseClamped = Math.min(release, 0.25);
            gainNode.gain.setTargetAtTime(0, note.stop, releaseClamped / 3);

            oscillators.forEach(oscillator => {
                this.stopAudioNode(oscillator, note.stop + releaseClamped, stopGainNode, isNoiseCut);
            });
        }
            break;

        case 3:
            oscillators.forEach((oscillator, i) => {
                let inst = getWave(this.context, option.instrument, findClosestNumberIndex(option.pitch), i);
                // Apply envelope to note
                let instEnvelope = inst.adsr;
                const release = instEnvelope[3];
                let velocity = gainNode.gain.value * 1.5;

                gainNode.gain.setValueAtTime(velocity, note.start);

                // Release phase
                const releaseClamped = Math.min(release, 0.25);
                gainNode.gain.setTargetAtTime(0, note.stop, releaseClamped / 3);

                this.stopAudioNode(oscillator, note.stop + releaseClamped, stopGainNode, isNoiseCut);
            });
    }

    // 音をストップさせる関数を返す //
    return () => {
        oscillators.forEach(oscillator => {
            this.stopAudioNode(oscillator, 0, stopGainNode, true);
        });
        if (note2 && note2.oscillator) this.stopAudioNode(note2.oscillator, 0, note2.stopGainNode, true);
    };
}