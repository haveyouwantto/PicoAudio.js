/**
 * SF2 Sample Provider
 * 
 * Provides sample-based audio playback from SoundFont 2 (.sf2) files.
 * All samples are pre-decoded into AudioBuffers at load time for synchronous access.
 * 
 * Usage:
 *   import { loadSF2, getSF2Sample, isSF2Loaded } from './sf2-provider';
 *   const ok = loadSF2(ctx, arrayBuffer);   // Pre-decode all samples
 *   const info = getSF2Sample(0, 69, false); // Sync! Returns {buffer, envelope, ...} or null
 */

import { parseSF2, decodeSF2Sample } from "../sf2/parser";
import { buildInstrumentSamples, buildProgramMap } from "../sf2/builder.js";
import { signed16 } from "../sf2/constants.js";

/** Parsed SF2 data (set by loadSF2) */
let sf2Data = null;

/** Pre-decoded AudioBuffers, keyed by sampleHeaderIndex */
const sf2BufferCache = [];

/**
 * Load and parse an SF2 SoundFont file, pre-decoding all samples into AudioBuffers.
 * @param {AudioContext} ctx - The Web Audio API AudioContext
 * @param {ArrayBuffer} arrayBuffer - The SF2 file binary data
 * @returns {boolean} Whether the SF2 was loaded and decoded successfully
 */
export function loadSF2(ctx, arrayBuffer) {
    try {
        const parsed = parseSF2(arrayBuffer);
        console.log('SF2 parsed successfully:', parsed);
        // Build derived tables used by the provider (provider owns selection logic)
        // Parser now returns structured {samples, instruments, presets}
        const instrumentSamples = parsed.instruments;
        const sampleHeaders = parsed.samples; // keep legacy name
        const programSamples = new Map();
        // Build programSamples map from presets (provider owns selection merging)
        for (const preset of parsed.presets) {
            const key = preset.isDrum ? `drum_${preset.bank}:${preset.program}` : `${preset.bank}:${preset.program}`;
            if (!programSamples.has(key)) programSamples.set(key, { name: preset.name, program: preset.program, bank: preset.bank, isDrum: preset.isDrum, samples: [] });
            const entry = programSamples.get(key);
            for (const zone of preset.zones) {
                const instIdx = zone.instrumentIndex;
                if (instIdx >= 0 && instIdx < instrumentSamples.length) {
                    entry.samples.push(...instrumentSamples[instIdx].samples);
                }
            }
        }

        const sampleMeta = {};
        for (let instIdx = 0; instIdx < instrumentSamples.length; instIdx++) {
            const inst = instrumentSamples[instIdx];
            if (!inst || !inst.samples) continue;
            for (const s of inst.samples) {
                if (s && typeof s.sampleId === 'number') {
                    sampleMeta[s.sampleId] = { pan: s.pan != null ? s.pan : 64, instrumentIndex: instIdx };
                }
            }
        }
        sf2Data = Object.assign({}, parsed, { instrumentSamples, programSamples, sampleMeta });
        console.log('SF2 parsed successfully:', sf2Data);
        // Clear any previous cache
        sf2BufferCache.length = 0;

        // Pre-decode every sample into an AudioBuffer
        // Skip terminator samples (sampleRate=0, start=end=0)
        const paired = new Set();
        for (let i = 0; i < sampleHeaders.length; i++) {
            const shdr = sampleHeaders[i];
            if (!shdr || shdr.sampleRate === 0 || shdr.start >= shdr.end) {
                sf2BufferCache[i] = null;
                continue;
            }

            // Decode 16-bit signed PCM → Float32Array (normalized to [-1, 1])
            const floatSamples = decodeSF2Sample(sf2Data.sampleData, shdr.start, shdr.end);

            if (floatSamples.length === 0) {
                sf2BufferCache[i] = null;
                continue;
            }

            // Create an AudioBuffer at the sample rate of the SF2 file
            // Stereo pairing logic: use instrument-scoped pan values to decide L/R pairing.
            // We no longer rely on sampleLink stitching across instruments.
            if (paired.has(i)) {
                // already created as part of a stereo pair and stored
                continue;
            }

            let audioBuffer = null;
            const meta = sf2Data.sampleMeta && sf2Data.sampleMeta[i];
            if (meta && meta.instrumentIndex != null) {
                const instIdx = meta.instrumentIndex;
                const inst = sf2Data.instrumentSamples[instIdx];
                if (inst && inst.samples) {
                    // Look for a partner within the same instrument whose pan is on the opposite side
                    const thisPan = (meta.pan != null) ? meta.pan : 64;
                    // Candidate: pan < 64 vs pan > 64 (skip centered)
                    const wantLeft = thisPan < 64;
                    let partner = null;
                    for (const cand of inst.samples) {
                        if (cand.sampleId === i) continue;
                        const candMeta = sf2Data.sampleMeta && sf2Data.sampleMeta[cand.sampleId];
                        const candPan = cand.pan != null ? cand.pan : (candMeta && candMeta.pan != null ? candMeta.pan : 64);
                        // require opposite side (left vs right). Ignore centered partners.
                        if (wantLeft && candPan > 64) {
                            partner = cand;
                        } else if (!wantLeft && candPan < 64) {
                            partner = cand;
                        }
                        if (partner) {
                            // basic overlap checks: similar sampleRate and similar length
                            const linkedHdr = sampleHeaders[partner.sampleId];
                            if (!linkedHdr) { partner = null; continue; }
                            if (linkedHdr.sampleRate !== shdr.sampleRate) { partner = null; continue; }
                            const len1 = shdr.end - shdr.start;
                            const len2 = linkedHdr.end - linkedHdr.start;
                            const maxDiff = Math.max(128, Math.floor(len1 * 0.1));
                            if (Math.abs(len1 - len2) > maxDiff) { partner = null; continue; }
                            // also check key/vel range compatibility (must overlap)
                            const candZone = partner;
                            const currZone = inst.samples.find(s => s.sampleId === i) || {};
                            const keyOverlap = !(currZone.keyRangeHi < candZone.keyRangeLo || currZone.keyRangeLo > candZone.keyRangeHi);
                            const velOverlap = !(currZone.velRangeHi < candZone.velRangeLo || currZone.velRangeLo > candZone.velRangeHi);
                            if (!keyOverlap || !velOverlap) { partner = null; continue; }
                            // If passes checks, we will decode both into stereo
                            break;
                        }
                    }
                    if (partner) {
                        const linkedHdr = sampleHeaders[partner.sampleId];
                        const floatSamples2 = decodeSF2Sample(parsed.sampleData, linkedHdr.start, linkedHdr.end);
                        const outLen = Math.max(floatSamples.length, floatSamples2.length);
                        audioBuffer = ctx.createBuffer(2, outLen, shdr.sampleRate);
                        audioBuffer.getChannelData(0).set(floatSamples);
                        audioBuffer.getChannelData(1).set(floatSamples2);
                        sf2BufferCache[i] = audioBuffer;
                        // Also store same stereo buffer for partner id so lookups by either id return stereo
                        sf2BufferCache[partner.sampleId] = audioBuffer;
                        paired.add(i);
                        paired.add(partner.sampleId);
                        continue;
                    }
                }
            }

            // No valid instrument-pan partner found — decode as mono
            audioBuffer = ctx.createBuffer(1, floatSamples.length, shdr.sampleRate);
            audioBuffer.getChannelData(0).set(floatSamples);
            sf2BufferCache[i] = audioBuffer;
        }
        // Populate sf2Data for external inspection and lookups
        sf2Data = Object.assign({}, parsed, { sampleHeaders, instrumentSamples, programSamples, sampleMeta });
        console.log(`SF2 loaded: ${sampleHeaders.length} samples decoded, ${programSamples.size} programs`);
        return true;
    } catch (e) {
        console.error('Failed to parse SF2:', e);
        sf2Data = null;
        sf2BufferCache.length = 0;
        return false;
    }
}

/**
 * Get the parsed SF2 data (for diagnostic / inspection purposes)
 */
export function getSF2Data() {
    return sf2Data;
}

/**
 * Check whether an SF2 file is currently loaded
 */
export function isSF2Loaded() {
    return sf2Data !== null;
}

/**
 * Retrieve an AudioBuffer + metadata for a given MIDI program & pitch.
 * This is a SYNCHRONOUS call — all samples were pre-decoded at load time.
 * 
 * @param {number} program  - MIDI program (instrument) number 0-127
 * @param {number} pitch    - MIDI note number 0-127 (used for key-range matching)
 * @param {boolean} [isDrum=false] - Whether this is a drum channel (channel 10)
 * @param {number} [bank=0]  - MIDI bank number for SF2 preset lookup
 * @returns {{
 *   buffer: AudioBuffer,
 *   rootKey: number,
 *   correction: number,
 *   startLoop: number,
 *   endLoop: number,
 *   loopMode: number,
 *   originalSampleRate: number,
 *   envelope: { delay: number, attack: number, hold: number, decay: number, sustain: number, release: number }
 * } | null}
 */
export function getSF2Sample(program, pitch, isDrum = false, bank = 0) {
    if (!sf2Data) return null;

    let entry = null;

    // Local program lookup (parser returns raw programSamples Map)
    const localGetProgramEntry = (programSamples, programNum, isDrumFlag, bankNum) => {
        const keys = [];
        if (isDrumFlag) {
            keys.push(`drum_${bankNum}:${programNum}`);
            keys.push(`drum_${programNum}`);
        } else {
            keys.push(`${bankNum}:${programNum}`);
            keys.push(`${programNum}`);
        }
        for (const k of keys) if (programSamples.has(k)) return programSamples.get(k);
        return null;
    };

    if (isDrum) {
        entry = localGetProgramEntry(sf2Data.programSamples, program, true, bank);
        if (!entry) {
            // Fallback: find any drum entry that covers the key
            for (const [key, e] of sf2Data.programSamples) {
                if (e.isDrum) {
                    for (const sample of e.samples) {
                        if (pitch >= sample.keyRangeLo && pitch <= sample.keyRangeHi) {
                            entry = e;
                            break;
                        }
                    }
                    if (entry) break;
                }
            }
        }
    } else {
        entry = localGetProgramEntry(sf2Data.programSamples, program, false, bank);
    }

    if (!entry) return null;

    // Find the sample whose key range covers the requested pitch
    let bestSample = null;
    for (const sample of entry.samples) {
        if (pitch >= sample.keyRangeLo && pitch <= sample.keyRangeHi) {
            bestSample = sample;
            break;
        }
    }
    // Fallback: use the first sample
    if (!bestSample) bestSample = entry.samples[0];
    if (!bestSample) return null;

    const buffer = sf2BufferCache[bestSample.sampleId];
    if (!buffer) return null;

    // Convert sample-point loop offsets to sample-frame offsets
    const sampleStart = bestSample.sampleStart;
    const loopStartFrames = Math.max(0, bestSample.startLoop - sampleStart);
    const loopEndFrames = Math.max(loopStartFrames + 1, bestSample.endLoop - sampleStart);
    // Compute runtime gain/envelope from parsed generators (zone overrides global)
    function mergeGenerators(zoneGens, globalGens) {
        const out = {};
        if (globalGens) Object.assign(out, globalGens);
        if (zoneGens) Object.assign(out, zoneGens);
        return out;
    }

    const merged = mergeGenerators(bestSample.generators, bestSample.globalGenerators);
    const gain = (merged && merged.initialAttenuation_gain != null) ? merged.initialAttenuation_gain : 1;
    const envelope = {
        delay: (merged && merged.delayVolEnv != null) ? merged.delayVolEnv : 0,
        attack: (merged && merged.attackVolEnv != null) ? merged.attackVolEnv : 0.001,
        hold: (merged && merged.holdVolEnv != null) ? merged.holdVolEnv : 0,
        decay: (merged && merged.decayVolEnv != null) ? merged.decayVolEnv : 0,
        sustain: (merged && merged.sustainVolEnv != null) ? merged.sustainVolEnv : 1.0,
        release: (merged && merged.releaseVolEnv != null) ? merged.releaseVolEnv : 0.01
    };
    const pan = (merged && merged.pan != null) ? merged.pan : (bestSample.pan != null ? bestSample.pan : 64);

    return {
        buffer,
        rootKey: bestSample.rootKey,
        correction: bestSample.correction,
        coarseTune: bestSample.coarseTune || 0,
        fineTune: bestSample.fineTune || 0,
        startLoop: loopStartFrames,
        endLoop: loopEndFrames,
        loopMode: bestSample.loopMode,
        originalSampleRate: bestSample.sampleRate,
        gain,
        envelope,
        pan
    };
}

export default { loadSF2, getSF2Sample, isSF2Loaded, getSF2Data };