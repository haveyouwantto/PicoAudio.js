/**
 * Compile time feature switches.
 *
 * The values below are what an unbundled (source) build behaves like: every
 * feature is available, exactly like the published "full" bundle. The rollup
 * build replaces this file per variant (see rollup.config.js), so flags that
 * are false there turn the matching imports and code paths into dead code that
 * rollup strips from the bundle.
 *
 *   basic               quality 0 only (upstream PicoAudio feature set)
 *   wave                quality 0 + 1 (periodic wave / wavetable mode)
 *   wave-nodefault      + the above without the built in default wave table
 *   sf2                 quality 0 + 4 (SoundFont 2)
 *   sf2-wave-nodefault  quality 0 + 1 + 4, without the default wave table
 *   full                quality 0 + 1 + 4, with the default wave table
 *
 * soundQuality 3 was the sample bank, it is gone: 3 plays the SoundFont
 * engine, and a wavetable / soundfont mode without its table or font loaded
 * falls back to the basic waveform engine.
 */

/** soundQuality 1: harmonic wavetables (periodic wave instrument set). */
export const HAS_WAVE = true;

/** soundQuality 3 (SoundFont 2, the old sample bank slot) and 4. */
export const HAS_SF2 = true;

/** Embed the built in wave table (~29 KB of base64) in the bundle. */
export const HAS_DEFAULT_WAVE = true;
