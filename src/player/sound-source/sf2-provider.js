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

        const { samples: sampleHeaders, instruments: instrumentSamples, sampleData, presets } = parsed;

        // Build programSamples map from presets (zone -> instrument -> samples)
        const programSamples = new Map();
        for (const preset of presets) {
            const key = preset.isDrum ? `drum_${preset.bank}:${preset.program}` : `${preset.bank}:${preset.program}`;
            if (!programSamples.has(key)) {
                programSamples.set(key, { name: preset.name, program: preset.program, bank: preset.bank, isDrum: preset.isDrum, samples: [] });
            }
            const entry = programSamples.get(key);
            for (const zone of preset.zones) {
                const instIdx = zone.instrumentIndex;
                if (instIdx >= 0 && instIdx < instrumentSamples.length) {
                    entry.samples.push(...instrumentSamples[instIdx].samples);
                }
            }
        }

        // sampleMeta: per-sampleId lookup for pan and instrument index (for stereo pairing and merging)
        const sampleMeta = {};
        for (let instIdx = 0; instIdx < instrumentSamples.length; instIdx++) {
            const inst = instrumentSamples[instIdx];
            if (!inst || !inst.samples) continue;
            for (const s of inst.samples) {
                if (s && typeof s.sampleId === 'number') {
                    const genPan = (s.generators && s.generators.pan != null) ? s.generators.pan : 64;
                    sampleMeta[s.sampleId] = { pan: genPan, instrumentIndex: instIdx };
                }
            }
        }
        sf2Data = { ...parsed, programSamples, sampleMeta };
        console.log('SF2 parsed successfully:', sf2Data);

        // Clear any previous cache
        sf2BufferCache.length = 0;

        // Pre-decode every sample into an AudioBuffer
        const paired = new Set();
        for (let i = 0; i < sampleHeaders.length; i++) {
            const shdr = sampleHeaders[i];
            if (!shdr || shdr.sampleRate === 0 || shdr.start >= shdr.end) {
                sf2BufferCache[i] = null;
                continue;
            }

            // Decode 16-bit signed PCM → Float32Array (normalized to [-1, 1])
            const floatSamples = decodeSF2Sample(sampleData, shdr.start, shdr.end);
            if (floatSamples.length === 0) {
                sf2BufferCache[i] = null;
                continue;
            }

            if (paired.has(i)) continue;

            const meta = sampleMeta[i];
            let audioBuffer = null;

            // Stereo pairing: find partner sample in same instrument with opposite pan
            if (meta && meta.instrumentIndex != null) {
                const inst = instrumentSamples[meta.instrumentIndex];
                if (inst && inst.samples) {
                    const thisPan = meta.pan != null ? meta.pan : 64;
                    const wantLeft = thisPan < 64;
                    let partner = null;
                    for (const cand of inst.samples) {
                        if (cand.sampleId === i) continue;
                        const candPan = cand.generators && cand.generators.pan != null ? cand.generators.pan : 64;
                        if (wantLeft && candPan > 64) partner = cand;
                        else if (!wantLeft && candPan < 64) partner = cand;
                        else continue;

                        const linkedHdr = sampleHeaders[partner.sampleId];
                        if (!linkedHdr || linkedHdr.sampleRate !== shdr.sampleRate) { partner = null; continue; }
                        const len1 = shdr.end - shdr.start;
                        const len2 = linkedHdr.end - linkedHdr.start;
                        const maxDiff = Math.max(128, Math.floor(len1 * 0.1));
                        if (Math.abs(len1 - len2) > maxDiff) { partner = null; continue; }
                        // key/vel range overlap check
                        const zo = cand.generators || {};
                        const zc = inst.samples.find(s => s.sampleId === i);
                        const zg = zc ? zc.generators : {};
                        const zkr = zg.keyRange || [0, 127];
                        const zvr = zg.velRange || [0, 127];
                        const okr = zo.keyRange || [0, 127];
                        const ovr = zo.velRange || [0, 127];
                        if (zkr[1] < okr[0] || zkr[0] > okr[1]) { partner = null; continue; }
                        if (zvr[1] < ovr[0] || zvr[0] > ovr[1]) { partner = null; continue; }
                        break;
                    }
                    if (partner) {
                        const linkedHdr = sampleHeaders[partner.sampleId];
                        const floatSamples2 = decodeSF2Sample(sampleData, linkedHdr.start, linkedHdr.end);
                        const outLen = Math.max(floatSamples.length, floatSamples2.length);
                        audioBuffer = ctx.createBuffer(2, outLen, shdr.sampleRate);
                        audioBuffer.getChannelData(0).set(floatSamples);
                        audioBuffer.getChannelData(1).set(floatSamples2);
                        sf2BufferCache[i] = audioBuffer;
                        sf2BufferCache[partner.sampleId] = audioBuffer;
                        paired.add(i);
                        paired.add(partner.sampleId);
                        continue;
                    }
                }
            }

            // Mono
            audioBuffer = ctx.createBuffer(1, floatSamples.length, shdr.sampleRate);
            audioBuffer.getChannelData(0).set(floatSamples);
            sf2BufferCache[i] = audioBuffer;
        }

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

/** Resolve the global generators for a sample via its instrument. */
function resolveInstrumentGenerators(sampleId) {
    const meta = sf2Data.sampleMeta && sf2Data.sampleMeta[sampleId];
    if (!meta || meta.instrumentIndex == null) return null;
    const inst = sf2Data.instruments[meta.instrumentIndex];
    return inst ? inst.generators : null;
}

/**
 * Retrieve an AudioBuffer + metadata for a given MIDI program & pitch.
 * This is a SYNCHRONOUS call — all samples were pre-decoded at load time.
 */
export function getSF2Sample(program, pitch, isDrum = false, bank = 0) {
    if (!sf2Data) return null;

    const { programSamples, samples: sampleHeaders } = sf2Data;

    let entry = null;
    const localGetProgramEntry = (ps, prog, drum, bn) => {
        const keys = drum
            ? [`drum_${bn}:${prog}`, `drum_${prog}`]
            : [`${bn}:${prog}`, `${prog}`];
        for (const k of keys) if (ps.has(k)) return ps.get(k);
        return null;
    };

    if (isDrum) {
        entry = localGetProgramEntry(programSamples, program, true, bank);
        if (!entry) {
            for (const [key, e] of programSamples) {
                if (!e.isDrum) continue;
                for (const sample of e.samples) {
                    const kr = sample.generators && sample.generators.keyRange;
                    if (kr && pitch >= kr[0] && pitch <= kr[1]) { entry = e; break; }
                }
                if (entry) break;
            }
        }
    } else {
        entry = localGetProgramEntry(programSamples, program, false, bank);
    }

    if (!entry) return null;

    // Find the sample whose key range covers the requested pitch
    let bestSample = null;
    for (const sample of entry.samples) {
        const kr = sample.generators && sample.generators.keyRange;
        if (kr && pitch >= kr[0] && pitch <= kr[1]) { bestSample = sample; break; }
    }
    if (!bestSample) bestSample = entry.samples[0];
    if (!bestSample) return null;

    const buffer = sf2BufferCache[bestSample.sampleId];
    if (!buffer) return null;

    // Merge: instrument-level globals first, then zone-level generators (zone overrides global)
    const merged = {};
    const globals = resolveInstrumentGenerators(bestSample.sampleId);
    if (globals) Object.assign(merged, globals);
    if (bestSample.generators) Object.assign(merged, bestSample.generators);

    const shdr = sampleHeaders[bestSample.sampleId];
    if (!shdr) return null;

    // Loop offsets in sample frames
    const sampleStart = shdr.start;
    const loopStartFrames = Math.max(0, shdr.startLoop - sampleStart);
    const loopEndFrames = Math.max(loopStartFrames + 1, shdr.endLoop - sampleStart);

    const gain = merged.initialAttenuation_gain != null ? merged.initialAttenuation_gain : 1;
    const envelope = {
        delay:   merged.delayVolEnv != null   ? merged.delayVolEnv   : 0,
        attack:  merged.attackVolEnv != null  ? merged.attackVolEnv  : 0.001,
        hold:    merged.holdVolEnv != null    ? merged.holdVolEnv    : 0,
        decay:   merged.decayVolEnv != null   ? merged.decayVolEnv   : 0,
        sustain: merged.sustainVolEnv != null ? merged.sustainVolEnv : 1.0,
        release: merged.releaseVolEnv != null ? merged.releaseVolEnv : 0.01,
    };
    const pan = merged.pan != null ? merged.pan : 64;

    return {
        buffer,
        rootKey: merged.rootKey >= 0 ? merged.rootKey : shdr.originalKey,
        correction: shdr.correction,
        coarseTune: merged.coarseTune || 0,
        fineTune: merged.fineTune || 0,
        startLoop: loopStartFrames,
        endLoop: loopEndFrames,
        loopMode: merged.sampleModes != null ? merged.sampleModes : 0,
        originalSampleRate: shdr.sampleRate,
        gain,
        envelope,
        pan,
    };
}

export default { loadSF2, getSF2Sample, isSF2Loaded, getSF2Data };