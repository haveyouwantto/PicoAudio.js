/**
 * Why a note did not sound.
 *
 * Every engine can end up with nothing to play: the scheduler can decide the
 * note is already over, the preset lookup can find no preset for the
 * program/bank, and the synth can find no region for that key/velocity. All of
 * those look like "missing notes" and they happen in every engine, so a debug
 * run needs to say which one it was.
 *
 * Enabled by the existing picoAudio.debug flag (see the constructor); set it in
 * the console with `window.picoAudio.debug = true` (or from the app's debugger)
 * and play the song that loses notes.
 */

/** @param {Object} picoAudio the PicoAudio instance @param {string} reason */
export function noteDropped(picoAudio, reason, option) {
    if (!picoAudio || !picoAudio.debug) return;
    const info = option
        ? `ch${option.channel} prog${option.instrument} bank${option.bank || 0} `
            + `key${option.pitch} vel${Math.round(Number.isFinite(option.midiVelocity) ? option.midiVelocity : option.velocity * 127)}`
            + ` @${Number(option.startTime || 0).toFixed(2)}s`
        : '';
    console.warn(`[PicoAudio] note dropped: ${reason} ${info}`);
}

export default { noteDropped };
