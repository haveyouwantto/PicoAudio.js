/**
 * SF2 Sample Provider — TinySoundFont port edition
 *
 * The SoundFont engine is a JavaScript port of TinySoundFont (tsf.h,
 * https://github.com/schellingb/TinySoundFont, MIT): the font is parsed and
 * expanded into TSF preset regions once at load time, and every note is
 * synthesized offline by the ported TSF voice renderer (player/sf2/tsf*.js).
 *
 * There is deliberately no per-layer gain shaping, loudness balancing or
 * velocity curve left here: volume is exactly what the SoundFont says
 * (initial attenuation + the note-on velocity modulator) plus the global
 * gain, which is what the reference implementation does.
 */

import { loadTSFFont } from '../sf2/tsf.js';
import { noteOnVoices } from '../sf2/tsf-synth.js';
import { tsfCents2Hertz, tsfDecibelsToGain } from '../sf2/tsf-font.js';

/** Parsed font for the current session (set by loadSF2) */
let sf2Font = null;

/** Lightweight description for diagnostics/UI */
let sf2Info = null;

/**
 * Load and parse an SF2 SoundFont file.
 * @param {AudioContext} ctx - sample rate the notes will be rendered at
 * @param {ArrayBuffer} arrayBuffer - The SF2 file binary data
 * @returns {boolean} Whether the SF2 was loaded and parsed successfully
 */
export function loadSF2(ctx, arrayBuffer) {
    try {
        const sampleRate = (ctx && ctx.sampleRate) ? ctx.sampleRate : 44100;
        const font = loadTSFFont(arrayBuffer, sampleRate, 0);
        sf2Font = font;
        sf2Info = {
            presets: font.presets.length,
            regions: font.regionCount,
            samples: font.samples.length,
            sampleRate,
        };
        console.log(`SF2 loaded (TinySoundFont port): ${sf2Info.presets} presets, `
            + `${sf2Info.regions} regions, ${sf2Info.samples} sample frames @ ${sampleRate}Hz`);
        return true;
    } catch (e) {
        console.error('Failed to parse SF2:', e);
        sf2Font = null;
        sf2Info = null;
        return false;
    }
}

/** The loaded TSF font (null when nothing is loaded) */
export function getSF2Font() {
    return sf2Font;
}

/** Check whether an SF2 file is currently loaded */
export function isSF2Loaded() {
    return sf2Font !== null;
}

/** Parsed font statistics (diagnostics) */
export function getSF2Data() {
    return sf2Info;
}

/**
 * Resolve which preset a MIDI program plays.
 *
 * Melodic instruments always use bank 0 (the app does not expose MIDI bank
 * select). Percussion only ever uses a kit bank: a channel 9 note carries the
 * channel's program but no meaningful bank select, so falling back to the
 * melodic preset of that program (bank 0) would silence the drums — or worse,
 * play a piano note for every hit. Kits are tried in GM order (128/program,
 * then 128/0) and the first one that actually covers the key and velocity
 * wins, which mirrors the old "a kit must be a drum kit and must cover the
 * note" selection.
 */
export function getSF2PresetIndex(program, isDrum = false, bank = 0, key = -1, velocity = -1) {
    if (!sf2Font) return -1;
    if (!isDrum) return sf2Font.getPresetIndex(0, program);

    const candidates = [];
    if (bank >= 120) candidates.push([bank, program]);
    candidates.push([128, program], [128, 0]);

    const kits = [];
    for (const [b, p] of candidates) {
        const index = sf2Font.getPresetIndex(b, p);
        if (index >= 0 && !kits.includes(index)) kits.push(index);
    }
    if (kits.length === 0) return -1;
    if (key < 0 || velocity < 0) return kits[0];

    const covering = kits.find((index) => presetCovers(sf2Font, index, key, velocity));
    return covering !== undefined ? covering : kits[0];
}

/** Does the preset have a region for this key/velocity? (MIDI velocity 0..127) */
function presetCovers(font, index, key, velocity) {
    const preset = font.presets[index];
    if (!preset) return false;
    return preset.regions.some((r) => key >= r.lokey && key <= r.hikey
        && velocity >= r.lovel && velocity <= r.hivel);
}

/**
 * Regions that would sound for a note — the TSF equivalent of the old
 * "resolved layers" list, for diagnostics and tests.
 */
export function getSF2Regions(program, pitch, velocity = 100, isDrum = false, bank = 0) {
    if (!sf2Font) return [];
    const presetIndex = getSF2PresetIndex(program, isDrum, bank, pitch, velocity);
    if (presetIndex < 0) return [];
    const vel = Math.max(0, Math.min(127, velocity)) / 127;
    const voices = noteOnVoices(sf2Font, presetIndex, pitch, vel);
    return voices.map((v) => ({
        ...v.region,
        presetIndex,
        presetName: sf2Font.getPresetName(presetIndex),
        // Envelope parameters as the voice sees them, i.e. with the key
        // number scaling (gen 39/40) already applied, in seconds.
        resolvedAmpEnv: { ...v.ampenv.parameters },
        resolvedModEnv: { ...v.modenv.parameters },
    }));
}

/** Name of the preset a MIDI program resolves to (diagnostics). */
export function getSF2PresetName(program, isDrum = false, bank = 0) {
    const index = getSF2PresetIndex(program, isDrum, bank);
    return index < 0 ? null : sf2Font.getPresetName(index);
}

/**
 * Diagnostic view of the regions a note triggers.
 *
 * The engine no longer resolves "layers" with its own gain/envelope maths, so
 * this only renames TSF region fields into the shape the analysis scripts in
 * the JMBox repository were written against. Nothing in the playback path
 * uses it.
 */
export function getSF2Layers(program, pitch, velocity = 100, isDrum = false, bank = 0) {
    if (!sf2Font) return [];
    return getSF2Regions(program, pitch, velocity, isDrum, bank).map((r) => ({
        buffer: null,
        sampleId: r.sampleId,
        sampleName: sf2Font.getSampleName(r.sampleId),
        instrumentName: r.presetName,
        rootKey: r.pitchKeycenter,
        correction: 0,
        coarseTune: r.transpose,
        fineTune: r.tune,
        scaleTuning: r.pitchKeytrack,
        originalSampleRate: r.sampleRate,
        startLoop: r.loopStart,
        endLoop: r.loopEnd,
        loopMode: r.loopMode,
        headerStart: 0,
        sampleStart: r.offset,
        sampleEnd: r.end,
        gain: tsfDecibelsToGain(-r.attenuation * 10),
        pan: r.pan * 1000,
        pan1000: r.pan * 1000,
        envelope: r.resolvedAmpEnv,
        modEnv: r.resolvedModEnv,
        filterFc: r.initialFilterFc <= 13500 ? tsfCents2Hertz(r.initialFilterFc) : 20000,
        filterQ: r.initialFilterQ,
        keyRange: [r.lokey, r.hikey],
        velRange: [r.lovel, r.hivel],
        exclusiveClass: r.group,
        presetIndex: r.presetIndex,
        presetName: r.presetName,
    }));
}

export default {
    loadSF2,
    isSF2Loaded,
    getSF2Font,
    getSF2Data,
    getSF2PresetIndex,
    getSF2Regions,
    getSF2PresetName,
    getSF2Layers,
};
