/**
 * SF2 Sample Provider
 *
 * Provides sample-based audio playback from SoundFont 2 (.sf2) files.
 * All samples are pre-decoded into AudioBuffers at load time for synchronous access.
 * Rendering decisions (zone selection, envelope scheduling, filters, LFOs) live in
 * sf2-renderer.js — this module only resolves samples & merged generator parameters.
 *
 * Usage:
 *   import { loadSF2, getSF2Sample, isSF2Loaded } from './sf2-provider';
 *   const ok = loadSF2(ctx, arrayBuffer);   // Pre-decode all samples
 *   const layers = getSF2Layers(0, 69, 100, false); // Sync! Returns [{buffer, envelope, pan, ...}] or []
 */

import { parseSF2, decodeSF2Sample } from "../sf2/parser.js";
import { buildPresetZones } from "../sf2/builder.js";
import { SF2Gen, SF2SampleType } from "../sf2/constants.js";

/** Parsed SF2 data (set by loadSF2) */
let sf2Data = null;

/** Pre-decoded AudioBuffers, keyed by sampleHeaderIndex */
const sf2BufferCache = [];

/** Font-level volume normalization gain (1 = no change) */
let sf2FontGain = 1;

/** Target mean per-zone loudness (peak × attenuation) after normalization.
 *  0.15 ≈ Neo1MGM's measured level, which the classic players treat as normal. */
const FONT_LOUDNESS_TARGET = 0.15;
const FONT_GAIN_MIN = 0.25;
const FONT_GAIN_MAX = 2.5;

/**
 * Estimate the peak level of a Float32 sample array (strided scan for speed).
 */
function computePeak(floatArray) {
    let peak = 0;
    const length = floatArray.length;
    const step = Math.max(1, Math.floor(length / 20000));
    for (let i = 0; i < length; i += step) {
        const a = Math.abs(floatArray[i]);
        if (a > peak) peak = a;
    }
    return peak;
}

/**
 * Compute a font-level gain that brings the font's mean zone loudness
 * (sample peak × initial attenuation × sustain) to FONT_LOUDNESS_TARGET.
 * Fonts with hot samples / weak attenuation (e.g. GeneralUser GS, soundbank-emg)
 * get pulled down; quiet fonts get boosted — without flattening the font's
 * internal dynamics.
 */
function computeFontGain(presetZones, samplePeaks) {
    let sum = 0;
    let count = 0;
    for (const pz of presetZones) {
        for (const z of pz.zones) {
            const g = z.generators || {};
            const peak = samplePeaks[z.sampleId] || 0;
            if (!(peak > 0)) continue;
            const attenuation = g.initialAttenuation_gain != null ? g.initialAttenuation_gain : 1;
            const sustain = g.sustainVolEnv != null ? g.sustainVolEnv : 1;
            sum += peak * attenuation * sustain;
            count++;
        }
    }
    if (count === 0) return 1;
    const meanLoudness = sum / count;
    if (!(meanLoudness > 0) || !isFinite(meanLoudness)) return 1;
    return Math.max(FONT_GAIN_MIN, Math.min(FONT_GAIN_MAX, FONT_LOUDNESS_TARGET / meanLoudness));
}

/**
 * Load and parse an SF2 SoundFont file, pre-decoding all samples into AudioBuffers.
 * @param {AudioContext} ctx - The Web Audio API AudioContext
 * @param {ArrayBuffer} arrayBuffer - The SF2 file binary data
 * @returns {boolean} Whether the SF2 was loaded and decoded successfully
 */
export function loadSF2(ctx, arrayBuffer) {
    try {
        const parsed = parseSF2(arrayBuffer);

        const { samples: sampleHeaders, instruments: instrumentSamples, sampleData } = parsed;

        // Build fully-resolved preset zones (preset zone + instrument global + instrument zone merged)
        const presetZones = buildPresetZones(parsed.presets, parsed.presetBags || [], parsed.presetGens || [], instrumentSamples, sampleHeaders);

        // Keep the raw bag/gen arrays for buildPresetZones consumers & diagnostics
        sf2Data = { ...parsed, presetZones };
        console.log('SF2 parsed successfully:', { samples: sampleHeaders.length, presets: parsed.presets.length, zones: presetZones.reduce((n, p) => n + p.zones.length, 0) });

        // Clear any previous cache
        sf2BufferCache.length = 0;
        const samplePeaks = new Float64Array(sampleHeaders.length);

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
            samplePeaks[i] = computePeak(floatSamples);

            if (paired.has(i)) continue;

            let audioBuffer = null;

            // Stereo pairing: find partner sample that shares the left/right link bits
            const linkedIdx = findStereoPartner(shdr, sampleHeaders, paired);
            if (linkedIdx != null) {
                const linkedHdr = sampleHeaders[linkedIdx];
                if (linkedHdr && linkedHdr.sampleRate === shdr.sampleRate) {
                    const floatSamples2 = decodeSF2Sample(sampleData, linkedHdr.start, linkedHdr.end);
                    samplePeaks[linkedIdx] = computePeak(floatSamples2);
                    const outLen = Math.max(floatSamples.length, floatSamples2.length);
                    audioBuffer = ctx.createBuffer(2, outLen, shdr.sampleRate);

                    // Determine which channel each side occupies
                    const isLeft = (shdr.sampleType & (SF2SampleType.leftSample | SF2SampleType.romLeftSample)) !== 0;
                    const isRight = (shdr.sampleType & (SF2SampleType.rightSample | SF2SampleType.romRightSample)) !== 0;
                    const thisIsLeft = !isRight; // default left unless explicitly right
                    audioBuffer.getChannelData(thisIsLeft ? 0 : 1).set(floatSamples);
                    audioBuffer.getChannelData(thisIsLeft ? 1 : 0).set(floatSamples2);
                    sf2BufferCache[i] = audioBuffer;
                    sf2BufferCache[linkedIdx] = audioBuffer;
                    paired.add(i);
                    paired.add(linkedIdx);
                    continue;
                }
            }

            // Mono
            audioBuffer = ctx.createBuffer(1, floatSamples.length, shdr.sampleRate);
            audioBuffer.getChannelData(0).set(floatSamples);
            sf2BufferCache[i] = audioBuffer;
        }

        console.log(`SF2 loaded: ${sampleHeaders.length} samples decoded, ${presetZones.length} presets`);
        sf2FontGain = computeFontGain(presetZones, samplePeaks);
        sf2Data.fontGain = sf2FontGain;
        console.log(`SF2 volume normalization: fontGain=${sf2FontGain.toFixed(3)}`);
        return true;
    } catch (e) {
        console.error('Failed to parse SF2:', e);
        sf2Data = null;
        sf2BufferCache.length = 0;
        return false;
    }
}

/**
 * Find the stereo partner of a sample header via the sampleLink / sampleType flags.
 * @returns {number|null} linked sample index, or null
 */
function findStereoPartner(shdr, sampleHeaders, paired) {
    if (paired.has(shdr.sampleLink)) return null;
    if (shdr.start === 0 && shdr.end === 0) return null; // terminal record
    const flags = shdr.sampleType & 0x7fff; // strip ROM bit
    const isLeft = (flags & SF2SampleType.leftSample) !== 0;
    const isRight = (flags & SF2SampleType.rightSample) !== 0;
    if (!isLeft && !isRight) return null;
    if (shdr.sampleLink >= 0 && shdr.sampleLink < sampleHeaders.length) {
        return shdr.sampleLink;
    }
    return null;
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
 * Current font-level volume normalization gain (1 = no normalization).
 */
export function getSF2FontGain() {
    return sf2FontGain;
}

/**
 * Helper: convert a legacy 0..127 pan value to -1..1 StereoPanner position.
 * SF2 spec pan is 0..1000 (500 = center); both are handled.
 */
export function panToPosition(pan) {
    if (pan == null) return 0;
    let p = pan;
    if (p > 127) p = (p / 1000) * 127; // normalize SF2 0..1000 → 0..127
    return (p / 127) * 2 - 1; // 0..127 → -1..1
}

/**
 * Resolve the rendered layers for a given MIDI program & pitch & velocity.
 *
 * Returns an array of fully-resolved layer objects (typically 1, but a preset
 * may layer several zones across a key, e.g. stereo pairs or velocity layers):
 *   {
 *     buffer,           // AudioBuffer (mono or pre-paired stereo)
 *     rootKey,          // MIDI key the sample was recorded at
 *     correction,       // cents tuning from sample header
 *     coarseTune,       // semitones
 *     fineTune,         // cents
 *     scaleTuning,      // cents per key (default 100 → normal chromatic)
 *     startLoop,        // loop start (sample frames, absolute)
 *     endLoop,          // loop end (sample frames, absolute)
 *     loopMode,         // 0=no loop, 1=continuous, 2=loop until release, 3=release loop
 *     originalSampleRate,
 *     gain,             // initial attenuation as linear gain multiplier
 *     envelope,         // volume envelope {delay,attack,hold,decay,sustain,release}
 *     modEnv,           // modulation envelope {delay,attack,hold,decay,sustain,release}
 *     pitchModEnvAmount,   // cents of pitch modulation from mod env (gen 7)
 *     filterFc,         // Hz (initial filter cutoff)
 *     filterQ,          // linear Q
 *     filterEnvAmount,  // cents of cutoff modulation from mod env (gen 11)
 *     vibLFO,           // {delay, freqHz, toPitchCents}
 *     modLFO,           // {delay, freqHz, toPitchCents, toFilterFcCents, toVolumeGain}
 *     pan,              // legacy 0..127
 *     pan1000,          // SF2 0..1000
 *     exclusiveClass,
 *     keyRange, velRange,
 *     sampleName, instrumentName
 *   }
 *
 * @param {number} program - MIDI program number
 * @param {number} pitch - MIDI note number
 * @param {number} velocity - MIDI velocity 0..127
 * @param {boolean} isDrum
 * @param {number} bank
 * @returns {Array<Object>} resolved layers (zero-length if no match)
 */
export function getSF2Layers(program, pitch, velocity = 100, isDrum = false, bank = 0) {
    if (!sf2Data) return [];

    const { presetZones, samples: sampleHeaders } = sf2Data;

    // Deterministic preset selection. The app does not expose MIDI bank
    // selection, so melodic instruments always resolve to bank 0. A drum note
    // must trigger exactly ONE drum kit — layering every kit that covers the
    // pitch (Ct2mgm: 138 kits) caused ~200 audio sources per hit (freeze) and
    // summed full-gain layers (loudness).
    const presetIsDrum = (pz) => pz.isDrum || pz.bank >= 120;
    const presetCovers = (pz) => pz.zones.some(z =>
        pitch >= z.keyRange[0] && pitch <= z.keyRange[1] &&
        velocity >= z.velRange[0] && velocity <= z.velRange[1]);

    const selectors = isDrum
        ? [
            // exact kit from the MIDI (bank + program)
            (pz) => presetIsDrum(pz) && pz.bank === bank && pz.program === program,
            // GM standard drum kit
            (pz) => presetIsDrum(pz) && pz.bank === 128 && pz.program === 0,
            // bank-0 kit with the requested program
            (pz) => presetIsDrum(pz) && pz.bank === 0 && pz.program === program,
        ]
        : [
            // bank 0 only (MIDI bank select is intentionally ignored)
            (pz) => !presetIsDrum(pz) && pz.bank === 0 && pz.program === program,
        ];

    let matchedPresets = [];
    for (const selector of selectors) {
        const matches = presetZones.filter(selector).filter(presetCovers);
        if (matches.length > 0) {
            matchedPresets = matches;
            break;
        }
    }
    if (matchedPresets.length === 0) return [];

    const layers = [];
    for (const pz of matchedPresets) {
        for (const zone of pz.zones) {
            const g = zone.generators || {};

            // key/vel range matching
            const kr = zone.keyRange || g.keyRange || [0, 127];
            if (pitch < kr[0] || pitch > kr[1]) continue;
            const vr = zone.velRange || g.velRange || [0, 127];
            if (velocity < vr[0] || velocity > vr[1]) continue;

            const sampleId = zone.sampleId;
            if (sampleId == null || sampleId < 0 || sampleId >= sampleHeaders.length) continue;
            const shdr = sampleHeaders[sampleId];
            if (!shdr || shdr.sampleRate === 0) continue;

            const buffer = sf2BufferCache[sampleId];
            if (!buffer) continue;

            const layer = resolveLayerParameters(zone, shdr, sampleId, pz, buffer);
            if (layer) layers.push(layer);
        }
    }

    // Safety net: never let one note explode into hundreds of audio sources.
    // Legit fonts use 1-4 layers per note; anything beyond that is pathological.
    const MAX_LAYERS = 8;
    if (layers.length > MAX_LAYERS) {
        console.warn(`SF2: ${layers.length} layers for program ${program} pitch ${pitch} (drum=${isDrum}) — capping at ${MAX_LAYERS}`);
        layers.sort((a, b) => (b.gain || 0) - (a.gain || 0));
        layers.length = MAX_LAYERS;
    }
    return layers;
}

/**
 * Resolve the full parameter set for a single matched zone.
 */
function resolveLayerParameters(zone, shdr, sampleId, preset, buffer) {
    const g = zone.generators || {};

    // Sample address offsets (sample frames), applied to the header boundaries
    const startOffset = (g.startAddrsCoarseOffset || 0) * 32768 + (g.startAddrsOffset || 0);
    const endOffset = (g.endAddrsCoarseOffset || 0) * 32768 + (g.endAddrsOffset || 0);
    const startLoopOffset = (g.startLoopAddrsCoarseOffset || 0) * 32768 + (g.startLoopAddrsOffset || 0);
    const endLoopOffset = (g.endLoopAddrsCoarseOffset || 0) * 32768 + (g.endLoopAddrsOffset || 0);

    const sampleStart = Math.max(0, shdr.start + startOffset);
    const sampleEndRaw = Math.max(sampleStart + 1, shdr.end + endOffset);
    // Limit loop points into valid sample range
    const loopStart = Math.min(Math.max(sampleStart, shdr.startLoop + startLoopOffset), sampleEndRaw - 1);
    const loopEndRaw = shdr.endLoop + endLoopOffset;
    const loopEnd = Math.min(Math.max(loopStart + 1, loopEndRaw), sampleEndRaw);

    // Root key & tuning
    const rootKey = (g.rootKey != null && g.rootKey > 0) ? g.rootKey : shdr.originalKey;
    const correction = shdr.correction || 0;

    // Volume envelope with keynum-based time correction (gen 39/40)
    // keyNumToVolEnvHold/Decay are timecents per keynum relative to middle C (60).
    const keyNumDiff = rootKey - 60;
    const env = {
        delay:   g.delayVolEnv   != null ? g.delayVolEnv   : 0,
        attack:  g.attackVolEnv  != null ? g.attackVolEnv  : 0.001,
        hold:    g.holdVolEnv    != null ? g.holdVolEnv    : 0,
        decay:   g.decayVolEnv   != null ? g.decayVolEnv   : 0,
        sustain: g.sustainVolEnv != null ? g.sustainVolEnv : 1.0,
        release: g.releaseVolEnv != null ? g.releaseVolEnv : 0.01,
    };
    // Keynum scaling: timecents per keynum * (root - 60)
    if (g.keyNumToVolEnvHold != null) {
        env.hold = Math.max(0, timecentsToSecondsSafe(g.keyNumToVolEnvHold * keyNumDiff));
    }
    if (g.keyNumToVolEnvDecay != null) {
        env.decay = Math.max(0.001, timecentsToSecondsSafe(g.keyNumToVolEnvDecay * keyNumDiff));
    }

    // Modulation envelope with keynum corrections (gen 31/32)
    const modEnv = {
        delay:   g.delayModEnv_seconds   != null ? g.delayModEnv_seconds   : 0,
        attack:  g.attackModEnv_seconds  != null ? g.attackModEnv_seconds  : 0.001,
        hold:    g.holdModEnv_seconds    != null ? g.holdModEnv_seconds    : 0,
        decay:   g.decayModEnv_seconds   != null ? g.decayModEnv_seconds   : 0,
        sustain: g.sustainModEnv         != null ? g.sustainModEnv         : 1.0,
        release: g.releaseModEnv_seconds != null ? g.releaseModEnv_seconds : 0.01,
    };
    if (g.keyNumToModEnvHold != null) {
        modEnv.hold = Math.max(0, timecentsToSecondsSafe(g.keyNumToModEnvHold * keyNumDiff));
    }
    if (g.keyNumToModEnvDecay != null) {
        modEnv.decay = Math.max(0.001, timecentsToSecondsSafe(g.keyNumToModEnvDecay * keyNumDiff));
    }

    // Initial filter (default: no filtering → 20kHz)
    const filterFc = g.initialFilterFc_hz != null ? g.initialFilterFc_hz : 20000;
    const filterQ = g.initialFilterQ != null ? g.initialFilterQ : 0.7071;

    // LFOs
    const vibLFO = {
        delay: g.delayVibLFO_seconds != null ? g.delayVibLFO_seconds : 0,
        freqHz: g.freqVibLFO_hz != null ? g.freqVibLFO_hz : 5,
        toPitchCents: g.vibLFOToPitch_cents != null ? g.vibLFOToPitch_cents : 0,
    };
    const modLFO = {
        delay: g.delayModLFO_seconds != null ? g.delayModLFO_seconds : 0,
        freqHz: g.freqModLFO_hz != null ? g.freqModLFO_hz : 5,
        toPitchCents: g.modLFOToPitch_cents != null ? g.modLFOToPitch_cents : 0,
        toFilterFcCents: g.modLFOToFilterFc_cents != null ? g.modLFOToFilterFc_cents : 0,
        toVolumeGain: g.modLFOToVolEnv_gain != null ? g.modLFOToVolEnv_gain : 1,
    };

    // Gain / pan — apply the font-level normalization on top of the zone's
    // own attenuation, so loud fonts and quiet fonts land at similar levels.
    let gain = (g.initialAttenuation_gain != null ? g.initialAttenuation_gain : 1) * sf2FontGain;
    if (!isFinite(gain) || gain < 0) gain = 0;
    const pan = g.pan != null ? g.pan : 64;
    const pan1000 = g.pan1000 != null ? g.pan1000 : 500;

    const instrumentName = preset && preset.name ? preset.name : '';
    const sampleName = shdr.name || '';

    return {
        buffer,
        sampleId,
        headerStart: shdr.start,
        sampleStart,
        sampleEnd: sampleEndRaw,
        rootKey,
        correction,
        coarseTune: g.coarseTune || 0,
        fineTune: g.fineTune || 0,
        scaleTuning: g.scaleTuning != null ? g.scaleTuning : 100,
        startLoop: loopStart,
        endLoop: loopEnd,
        loopMode: g.sampleModes != null ? g.sampleModes : 0,
        originalSampleRate: shdr.sampleRate,
        gain,
        envelope: env,
        modEnv,
        pitchModEnvAmount: g.modEnvToPitch_cents != null ? g.modEnvToPitch_cents : 0,
        filterFc,
        filterQ,
        filterEnvAmount: g.modEnvToFilterFc_cents != null ? g.modEnvToFilterFc_cents : 0,
        vibLFO,
        modLFO,
        pan,
        pan1000,
        exclusiveClass: g.exclusiveClass != null ? g.exclusiveClass : 0,
        keyRange: zone.keyRange || [0, 127],
        velRange: zone.velRange || [0, 127],
        sampleName,
        instrumentName,
    };
}

function timecentsToSecondsSafe(tc) {
    if (typeof tc !== 'number' || !isFinite(tc)) return 0;
    return Math.pow(2, tc / 1200);
}

/**
 * Backwards-compatible wrapper: returns the first matching layer or null.
 * (kept for existing call sites during the renderer migration)
 */
export function getSF2Sample(program, pitch, isDrum = false, bank = 0, velocity = 100) {
    const layers = getSF2Layers(program, pitch, velocity, isDrum, bank);
    return layers.length > 0 ? layers[0] : null;
}

export default { loadSF2, getSF2Sample, getSF2Layers, isSF2Loaded, getSF2Data, getSF2FontGain, panToPosition };
