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

import { parseSF2, decodeSF2Sample, getProgramEntry } from "./sf2-parser";

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
        sf2Data = parseSF2(arrayBuffer);
        // Clear any previous cache
        sf2BufferCache.length = 0;

        // Pre-decode every sample into an AudioBuffer
        // Skip terminator samples (sampleRate=0, start=end=0)
        for (let i = 0; i < sf2Data.sampleHeaders.length; i++) {
            const shdr = sf2Data.sampleHeaders[i];
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
            const audioBuffer = ctx.createBuffer(1, floatSamples.length, shdr.sampleRate);
            audioBuffer.getChannelData(0).set(floatSamples);
            sf2BufferCache[i] = audioBuffer;
        }

        console.log(`SF2 loaded: ${sf2Data.sampleHeaders.length} samples decoded, ${sf2Data.programSamples.size} programs`);
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
export function getSF2Sample(program, pitch, isDrum = false) {
    if (!sf2Data) return null;

    let entry = null;

    if (isDrum) {
        // Drum kits: SF2 stores a single drum preset (typically preset=0),
        // and individual drum sounds are differentiated by key range.
        // Iterate all drum kit entries and find one with a sample matching this pitch.
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
    } else {
        entry = getProgramEntry(sf2Data.programSamples, program, isDrum);
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
        envelope: bestSample.envelope || {
            delay: 0,
            attack: 0.001,
            hold: 0,
            decay: 0,
            sustain: 1.0,
            release: 0.01
        }
    };
}

export default { loadSF2, getSF2Sample, isSF2Loaded, getSF2Data };