/**
 * Sound quality presets for the SF2 engines, the audio counterpart of a game's
 * graphics presets.
 *
 * The reference implementation always runs every DSP stage. Measured with
 * scripts/browser-bench.mjs --page=rt-profile (GeneralUser GS, a dense song),
 * the optional ones cost, in the AudioWorklet engine:
 *
 *   lowpass filter   the most expensive part of the per sample loop
 *   LFOs             modulation wheel / vibrato, per block
 *   modulation env   filter and pitch modulation, per block
 *
 * Switching a stage off changes the sound of the presets that use it, exactly
 * like lowering a graphics preset changes the picture - the default is 'high',
 * which is the faithful TinySoundFont behaviour.
 */

export const SF2_QUALITY_PRESETS = {
    /**
     * Reference behaviour: every stage runs (matches tsf.h), and the sample
     * interpolation is left to the user's own setting.
     */
    high: { filter: true, lfo: true, modEnv: true, interpolation: null },
    /** Drops the per block modulation stages; the filter and its timbre stay. */
    medium: { filter: true, lfo: false, modEnv: false, interpolation: null },
    /**
     * Also drops the lowpass filter and switches to nearest interpolation.
     * Interpolation is the single most expensive part of the per sample loop
     * (measured -44% of the render time), so the low preset overrides whatever
     * sf2Interpolation says - that is the point of the preset.
     */
    low: { filter: false, lfo: false, modEnv: false, interpolation: 'nearest' },
};

/** @returns {{filter: boolean, lfo: boolean, modEnv: boolean}} */
export function resolveSF2Quality(settings) {
    const name = settings && settings.sf2Quality;
    return SF2_QUALITY_PRESETS[name] || SF2_QUALITY_PRESETS.high;
}

/** Copy the preset for `settings` into `target` (a mutable quality object). */
export function applySF2Quality(target, settings) {
    const preset = resolveSF2Quality(settings);
    target.filter = preset.filter;
    target.lfo = preset.lfo;
    target.modEnv = preset.modEnv;
    return target;
}

/**
 * The interpolation to use for a note: the preset can override the user's
 * sf2Interpolation setting (only the low preset does).
 */
export function resolveSF2Interpolation(settings) {
    const preset = resolveSF2Quality(settings);
    return preset.interpolation || (settings && settings.sf2Interpolation);
}

export default { SF2_QUALITY_PRESETS, resolveSF2Quality, applySF2Quality, resolveSF2Interpolation };
