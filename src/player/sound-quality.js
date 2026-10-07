import { HAS_SF2, HAS_WAVE } from '../features.js';
import { isWaveLoaded } from './sound-source/periodic-wave-man.js';
import { isSF2Loaded } from './sound-source/sf2-provider.js';

/**
 * Pick the engine a note actually uses.
 *
 * - soundQuality 3 used to be the sample bank; that engine is gone, so 3 now
 *   plays the SoundFont (4).
 * - Wavetable (1, -1) and SoundFont (4) modes fall back to the basic waveform
 *   engine (0) when their table / font has not been loaded yet, so a player
 *   that has not prepared its sound source still makes sound instead of
 *   silence.
 * - A build that does not contain an engine (see features.js) never selects
 *   it: those branches are compiled out.
 *
 * @param {Object} settings PicoAudio settings object
 * @returns {number} the soundQuality to use for this note
 */
export function resolveSoundQuality(settings) {
    let quality = settings.soundQuality;
    if (quality == 3) quality = 4;

    if (quality == 1 || quality == -1) {
        if (HAS_WAVE) {
            if (!isWaveLoaded()) quality = 0;
        } else {
            quality = 0;
        }
    } else if (quality == 4) {
        if (HAS_SF2) {
            if (!isSF2Loaded()) quality = 0;
        } else {
            quality = 0;
        }
    }
    return quality;
}
