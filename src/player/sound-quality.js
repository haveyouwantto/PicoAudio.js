import { HAS_SF2, HAS_WAVE } from '../features.js';
import { isSF2Loaded } from './sound-source/sf2-provider.js';

let deprecatedSineWarned = false;

/**
 * Pick the engine a note actually uses.
 *
 * - soundQuality 3 used to be the sample bank; that engine is gone, so 3 now
 *   plays the SoundFont (4).
 * - SoundFont (4) falls back to the basic waveform engine (0) when its font
 *   has not been loaded yet.
 * - soundQuality -1 (the old sine-wave mode) is deprecated: it now plays the
 *   basic waveform engine.
 * - A build that does not contain an engine (see features.js) never selects
 *   it: those branches are compiled out.
 *
 * @param {Object} settings PicoAudio settings object
 * @returns {number} the soundQuality to use for this note
 */
export function resolveSoundQuality(settings) {
    let quality = settings.soundQuality;
    if (quality == 3) quality = 4;

    if (quality == -1) {
        if (!deprecatedSineWarned) {
            deprecatedSineWarned = true;
            console.warn('PicoAudio: soundQuality -1 (sine wave) is deprecated; using basic waves');
        }
        quality = 0;
    } else if (quality == 1) {
        if (!HAS_WAVE) quality = 0;
    } else if (quality == 4) {
        if (HAS_SF2) {
            if (!isSF2Loaded()) quality = 0;
        } else {
            quality = 0;
        }
    }
    return quality;
}
