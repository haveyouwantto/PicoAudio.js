import { loadTSFFont } from '../sf2/tsf.js';

let sf2Font = null;

/** Parse an SF2 file; the font is expanded for ctx.sampleRate. */
export function loadSF2(ctx, arrayBuffer) {
    try {
        sf2Font = loadTSFFont(arrayBuffer, ctx.sampleRate, 0);
        return true;
    } catch (e) {
        console.error('Failed to parse SF2:', e);
        sf2Font = null;
        return false;
    }
}

export function getSF2Font() {
    return sf2Font;
}

export function isSF2Loaded() {
    return sf2Font !== null;
}

/**
 * Preset index for a MIDI program, or -1.
 * Melodic: the channel's bank, then bank 0.
 * Drums: kit (128, program), then (128, 0); the first kit that covers key and velocity wins.
 */
export function getSF2PresetIndex(program, isDrum = false, bank = 0, key = -1, velocity = -1) {
    if (!sf2Font) return -1;
    if (!isDrum) {
        const index = sf2Font.getPresetIndex(bank, program);
        return index >= 0 ? index : sf2Font.getPresetIndex(0, program);
    }

    const kits = [sf2Font.getPresetIndex(128, program), sf2Font.getPresetIndex(128, 0)]
        .filter((index) => index >= 0);
    if (kits.length === 0) return -1;
    if (key < 0 || velocity < 0) return kits[0];

    const covering = kits.find((index) => sf2Font.presets[index].regions.some((r) =>
        key >= r.lokey && key <= r.hikey && velocity >= r.lovel && velocity <= r.hivel));
    return covering !== undefined ? covering : kits[0];
}