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

/** Parsed font for the current session (set by loadSF2) */
let sf2Font = null;

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
        console.log(`SF2 loaded (TinySoundFont port): ${font.presets.length} presets, `
            + `${font.regionCount} regions, ${font.samples.length} sample frames @ ${sampleRate}Hz`);
        return true;
    } catch (e) {
        console.error('Failed to parse SF2:', e);
        sf2Font = null;
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
        sampleName: sf2Font.getSampleName(v.region.sampleId),
        presetIndex,
        presetName: sf2Font.getPresetName(presetIndex),
        // Envelope parameters as the voice sees them, i.e. with the key
        // number scaling (gen 39/40) already applied, in seconds.
        resolvedAmpEnv: { ...v.ampenv.parameters },
        resolvedModEnv: { ...v.modenv.parameters },
    }));
}

export default {
    loadSF2,
    isSF2Loaded,
    getSF2Font,
    getSF2PresetIndex,
    getSF2Regions,
};
