import InterpolationUtil from "../../util/interpolation-util";
import { getWave, getWaveTable, quickfadeArray, findClosestNumberIndex, getVolumeMul, WAVETABLE_SIZE } from "./periodic-wave-man";
import { getSample } from "./soundbank";
import { getSF2Sample, isSF2Loaded } from "./sf2-provider";

export default function createNote(option) {
    const isBuffer = this.settings.soundQuality == 1 || this.settings.soundQuality == 3 || this.settings.soundQuality == 4;
    const needsFilter = this.settings.soundQuality == 1 || this.settings.soundQuality == -1 || this.settings.soundQuality == 4;
    const note = this.createBaseNote(option, isBuffer, true, false, true, needsFilter); // oscillatorのstopはこちらで実行するよう指定
    if (note.isGainValueZero) return null;

    const oscillator = note.oscillator;
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

        case 1: {
            const inst = getWaveTable(this.context, option.instrument, findClosestNumberIndex(option.pitch));
            oscillator.buffer = inst.wavetable;
            // Set playbackRate so the wavetable cycles at the correct frequency.
            // wavetable recorded at sampleRate has fund freq = sampleRate / WAVETABLE_SIZE,
            // so we need playbackRate = targetFreq * WAVETABLE_SIZE / sampleRate.
            if (note.pitch) {
                oscillator.playbackRate.value = note.pitch * WAVETABLE_SIZE / this.context.sampleRate;
            }
            // Re-schedule pitch bend on playbackRate (not detune).
            // createBaseNote's isBuffer path scheduled detune with octave offset + bend,
            // but we use playbackRate for base pitch. Pitch bend moves to playbackRate
            // so that detune stays free for vibrato overlay.
            oscillator.detune.cancelScheduledValues(0);
            oscillator.detune.value = 0;
            if (option.pitchBend && option.pitchBend.length && note.pitch) {
                const songStartTime = this.states.startTime;
                const baseLatency = this.baseLatency;
                const baseRate = note.pitch * WAVETABLE_SIZE / this.context.sampleRate;
                option.pitchBend.forEach((p) => {
                    const t = Math.max(0, p.time + songStartTime + baseLatency);
                    // Convert semitone offset to playbackRate multiplier: rate * 2^(semitones/12)
                    oscillator.playbackRate.setValueAtTime(
                        baseRate * Math.pow(2, p.value / 12),
                        t
                    );
                });
            }
            // Setup modulation (CC1) — skipped by createBaseNote's isBuffer path
            // because it only connects modulation to oscillator.frequency (OscillatorNode only).
            // For BufferSource we route modulation to oscillator.detune.
            if (option.modulation && (option.modulation.length >= 2 || option.modulation[0].value > 0) && note.pitch) {
                const modOsc = this.context.createOscillator();
                const modGain = this.context.createGain();
                // Original: modGain.value = pitch * 10/440 * m, connected to oscillator.frequency (Hz).
                // Conversion to detune (cents): cents = 1200 * log2(1 + delta_f/f).
                // For small mod: cents ≈ 1200/(f*ln2) * delta = 1200/(f*ln2) * (f*10/440*m) = 1200*10/(440*ln2)*m ≈ 39.3*m.
                // So removal of pitch factor is correct: detune needs a pure m with a ~39.3x scaling.
                const centsScale = (1200 * 10) / (440 * Math.LN2); // ≈ 39.35 cents per unit m
                const scaleNode = this.context.createGain();
                scaleNode.gain.value = centsScale;
                const initialM = Math.min(1.0, option.modulation[0].value / 127);
                modGain.gain.value = initialM;
                const songStartTime = this.states.startTime;
                const baseLatency = this.baseLatency;
                let firstNode = true;
                option.modulation.forEach((p) => {
                    if (firstNode) { firstNode = false; return; }
                    const m = Math.min(1.0, p.value / 127);
                    const t = Math.max(0, p.time + songStartTime + baseLatency);
                    modGain.gain.setValueAtTime(m, t);
                });
                modOsc.frequency.value = 6;
                modOsc.connect(modGain);
                modGain.connect(scaleNode);
                scaleNode.connect(oscillator.detune);
                modOsc.start(note.start);
                this.stopAudioNode(modOsc, note.stop, modGain);
            }
            // Cache inst ref on note for envelope reuse below, avoiding duplicate getWaveTable() call
            note._inst = inst;
            break;
        }

        case 3:
            oscillator.loop = !quickfadeArray[option.instrument];
            const octave = findClosestNumberIndex(option.pitch);
            const sample = getSample(this.context, option.instrument, octave);

            if (sample && sample instanceof Promise) {
                sample.then(decoded => {
                    if (decoded) {
                        oscillator.buffer = decoded;
                    }
                }).catch(err => {
                    console.error(err);
                }
                );
            } else if (sample) {
                oscillator.buffer = sample;
            }

            const baseNote = 45 + octave * 12;
            oscillator.basePitch = (option.pitch - baseNote) * 100;
            oscillator.detune.value = oscillator.basePitch;
            const loopEnd = Math.max((sample.duration ?? 2) - 0.2, 2);
            oscillator.loopStart = Math.max(loopEnd - 1, 0.2);
            oscillator.loopEnd = loopEnd;
            break;

        case 4: {
            // SF2 SoundFont sample playback (synchronous — all samples pre-decoded)
            oscillator.loop = true;
            const inst = option.instrument;
            const pitch = option.pitch;
            const sf2Info = getSF2Sample(inst, pitch, false);

            // Cancel the detune that createBaseNote set for buffer path —
            // we use playbackRate for pitch, detune stays 0
            oscillator.detune.cancelScheduledValues(0);
            oscillator.detune.value = 0;

            if (sf2Info) {
                oscillator.buffer = sf2Info.buffer;

                // Calculate playback rate based on pitch relative to root key.
                // coarseTune = semitones, fineTune = cents, correction = sample header cents.
                // rate = 2^((pitch - rootKey + coarseTune + (fineTune + correction)/100) / 12)
                // Note: fineTune and correction are additive (both in cents).
                const semitoneOffset = pitch - sf2Info.rootKey + (sf2Info.coarseTune || 0)
                    + (sf2Info.fineTune + sf2Info.correction) / 100;
                const rate = Math.pow(2, semitoneOffset / 12);
                oscillator.playbackRate.value = rate;

                // Support pitch bend: schedule playbackRate changes based on pitchBend points
                if (option.pitchBend && option.pitchBend.length) {
                    const songStartTime = this.states.startTime;
                    const baseLatency = this.baseLatency;
                    option.pitchBend.forEach((p) => {
                        const t = Math.max(0, p.time + songStartTime + baseLatency);
                        oscillator.playbackRate.setValueAtTime(
                            rate * Math.pow(2, p.value / 12),
                            t
                        );
                    });
                }

                // Set loop points (convert sample frames → seconds)
                const sampleRate = sf2Info.originalSampleRate;
                if (sf2Info.loopMode === 0) {
                    oscillator.loop = false;
                } else {
                    oscillator.loop = true;
                    oscillator.loopStart = sf2Info.startLoop / sampleRate;
                    oscillator.loopEnd = sf2Info.endLoop / sampleRate;
                }

                // Cache envelope for the release/decay section below
                note._sf2Envelope = sf2Info.envelope;
            }
            break;
        }
    }

    // 音の終わりのプチプチノイズが気になるので、音の終わりに5ms減衰してノイズ軽減 //
    // Only applies to OscillatorNode (not BufferSource used by quality=1/3)
    if (!isBuffer && (oscillator.type == "sine" || oscillator.type == "triangle")
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
        case -1:
        case 1: {
            // quality=1: inst already resolved & cached by the waveform selection block above
            let inst = note._inst;
            if (!inst) inst = getWave(this.context, option.instrument, findClosestNumberIndex(option.pitch));
            // Apply envelope to note
            let instEnvelope = inst.adsr;
            const attack = instEnvelope[0], decay = instEnvelope[1], sustain = instEnvelope[2], release = instEnvelope[3];
            const isPluck = quickfadeArray[option.instrument];
            let velocity = gainNode.gain.value * 1.3;
            const attackClamped = Math.max(attack, 0.001);

            // Setup vibrato effect (real-time OscillatorNode LFO — avoids expensive
            // setValueCurveAtTime with 4410-element Float32Array per note).
            try {
                const instrumentVibrato = inst.vibrato;
                if (instrumentVibrato > 0) {
                    const vibOsc = this.context.createOscillator();
                    const vibGain = this.context.createGain();
                    // The original curve stretches sine(600 Hz, 0.1s) over 10s → effective 6 Hz
                    vibOsc.frequency.value = 6;
                    vibGain.gain.value = instrumentVibrato;
                    vibOsc.connect(vibGain);
                    vibGain.connect(oscillator.detune);

                    // Dynamic vibrato: modulate gain according to expression
                    if (option.expression) {
                        const songStartTime = this.states.startTime;
                        const baseLatency = this.baseLatency;
                        option.expression.forEach(element => {
                            const t = Math.max(0, element.time + songStartTime + baseLatency);
                            vibGain.gain.setValueAtTime(
                                instrumentVibrato * Math.pow(element.value / 127, 2),
                                t
                            );
                        });
                    }

                    vibOsc.start(note.start);
                    this.stopAudioNode(vibOsc, note.stop, vibGain);
                }
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
                // Use note.pitch for BufferSource compatibility (no .frequency property)
                const pitchFreq = isBuffer ? note.pitch : oscillator.frequency.value;
                const cutoffFreq = 492.35 * Math.exp(2.5 * option.velocity);

                const nyquist = this.context.sampleRate / 2;

                // 低频亮度补偿：低音弦在拨动时通常产生比例更高的瞬态分量。
                // 以 60 (C4) 为基点，每低 3 个八度补偿约 2 倍的倍率，让低音更"脆"。
                const pitchComp = Math.pow(2, (60 - option.pitch) / 36);

                // 初始阶段：必须足够高，包含完整的拨弦瞬态泛音
                // 应用亮度补偿 pitchComp
                const filterStart = Math.min(Math.max(pitchFreq * 4 * pitchComp, cutoffFreq * 1.5), nyquist);

                // 目标阶段：滤波器闭合的目标，不能过高（过高会导致失去滤波效果，像没加 filter），
                // 同时不能低于基频的 1.2 倍（防止高音被"吃"掉发闷）。
                const filterTarget = Math.min(Math.max(pitchFreq * 1.2, cutoffFreq * 0.05), nyquist);

                // 滤波器收敛速度：必须保持较快，产生"迅速消退的明亮感"。
                // 不能用 decay，否则低音衰减太慢，导致听感如同没加filter。
                const filterDecay = decayTime / 6;

                gainNode.gain.setTargetAtTime(0, note.start + attackClamped, decayTime / 2);
                if (filter) {
                    filter.frequency.setValueAtTime(filterStart, note.start + attackClamped);
                    filter.frequency.setTargetAtTime(filterTarget, note.start + attackClamped, filterDecay);
                }
            } else {
                gainNode.gain.setTargetAtTime(velocity * sustain, note.start + attackClamped, decay / 2);

                if (option.expression) {
                    const songStartTime = this.states.startTime;
                    const baseLatency = this.baseLatency;
                    // Use note.pitch for BufferSource compatibility (no .frequency property)
                    const pitchFreq = isBuffer ? note.pitch : (oscillator.frequency.value || 440);
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
                        if (filter) filter.frequency.linearRampToValueAtTime(targetFreq, t);
                    });
                }
            }

            // Sustain phase (no explicit scheduling needed)

            // Release phase
            const releaseClamped = Math.min(release, 0.25);
            gainNode.gain.setTargetAtTime(0, note.stop, releaseClamped / 3);

            this.stopAudioNode(oscillator, note.stop + releaseClamped, stopGainNode, isNoiseCut);
        }
            break;

        case 3:
            {
                let inst2 = getWave(this.context, option.instrument, findClosestNumberIndex(option.pitch));
                let instEnvelope2 = inst2.adsr;
                const release3 = instEnvelope2[3];
                let vel3 = gainNode.gain.value * 1.5;
                gainNode.gain.setValueAtTime(vel3, note.start);
                const releaseClamped3 = Math.min(release3, 0.25);
                gainNode.gain.setTargetAtTime(0, note.stop, releaseClamped3 / 3);
                this.stopAudioNode(oscillator, note.stop + releaseClamped3, stopGainNode, isNoiseCut);
                break;
            }

        case 4: {
            // SF2 envelope
            const sf2Env = note._sf2Envelope || { delay: 0, attack: 0.001, hold: 0, decay: 0, sustain: 1.0, release: 0.05 };
            // Generic SF2 ADSR schedule (delay → attack → hold → decay → sustain → release)
            // Use linear ramps and avoid special-casing by instrument type here.
            let velocity = gainNode.gain.value;
            const attackStart = note.start + (sf2Env.delay || 0);
            const attackTime = Math.max(sf2Env.attack || 0, 0.001);
            const holdTime = Math.max(sf2Env.hold || 0, 0);
            const decayTime = Math.max(sf2Env.decay || 0, 0.001);
            const sustainLevel = sf2Env.sustain || 1.0;
            const releaseTime = Math.max(sf2Env.release || 0.05, 0.001);

            // Start scheduling
            gainNode.gain.setValueAtTime(0, attackStart);
            // Attack to peak
            gainNode.gain.setTargetAtTime(velocity, attackStart, attackTime * 0.33);
            const attackEnd = attackStart + attackTime;
            const decayStart = attackEnd + holdTime;

            // Decay to sustain level (ensure we start from peak at decayStart)
            gainNode.gain.setTargetAtTime(velocity * sustainLevel, decayStart, decayTime * 0.33); // Ensure we don't schedule past note.stop

            // Expression/filter handling remains but is independent of ADSR shape
            if (option.expression && filter) {
                const songStartTime = this.states.startTime;
                const baseLatency = this.baseLatency;
                const pitchFreq = isBuffer ? note.pitch : 440;
                const nyquist = this.context.sampleRate / 2;
                option.expression.forEach((p) => {
                    const t = Math.max(0, p.time + songStartTime + baseLatency);
                    const expScale = p.value / 127;
                    const baseCutoff = pitchFreq * 4;
                    const maxCutoff = Math.min(nyquist, 16000);
                    const targetFreq = baseCutoff + (maxCutoff - baseCutoff) * Math.pow(expScale, 4);
                    filter.frequency.linearRampToValueAtTime(targetFreq, t);
                });
            }

            // Release: estimate current level at note.stop and ramp to 0
            const releaseStart = note.stop;
            const releaseEnd = note.stop + releaseTime;
            function estimateLevelAt(t) {
                if (t <= attackStart) return 0;
                if (t <= attackEnd) return velocity * ((t - attackStart) / attackTime);
                if (t <= decayStart) return velocity;
                const decayEnd = decayStart + decayTime;
                if (t <= decayEnd) {
                    const frac = (t - decayStart) / decayTime;
                    return velocity * (1 - frac * (1 - sustainLevel));
                }
                return velocity * sustainLevel;
            }
            const preReleaseLevel = Math.max(0, estimateLevelAt(releaseStart));
            gainNode.gain.setValueAtTime(preReleaseLevel, releaseStart);
            gainNode.gain.setTargetAtTime(0, releaseStart, releaseTime * 0.33);
            this.stopAudioNode(oscillator, releaseEnd, stopGainNode, isNoiseCut);
            break;
        }
    }

    // 音をストップさせる関数を返す //
    return () => {
        this.stopAudioNode(oscillator, 0, stopGainNode, true);
        if (note2 && note2.oscillator) this.stopAudioNode(note2.oscillator, 0, note2.stopGainNode, true);
    };
}