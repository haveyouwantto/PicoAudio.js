import { timecentsToSeconds, centibelsToGain } from './constants.js';

export function extractEnvelope(gens, genStart, genEnd) {
    const envelope = { delay:0, attack:0.001, hold:0, decay:0, sustain:1.0, release:0.01 };
    for (let g = genStart; g < genEnd && g < gens.length; g++) {
        const gen = gens[g];
        switch (gen.type) {
            case 33: envelope.delay = timecentsToSeconds(gen.amount); break;
            case 34: envelope.attack = Math.max(0.001, timecentsToSeconds(gen.amount)); break;
            case 35: envelope.hold = timecentsToSeconds(gen.amount); break;
            case 36: envelope.decay = timecentsToSeconds(gen.amount); break;
            case 37: envelope.sustain = centibelsToGain(gen.amount); break;
            case 38: envelope.release = Math.max(0.001, timecentsToSeconds(gen.amount)); break;
        }
    }
    return envelope;
}

export function mergeEnvelopes(zoneEnv, globalEnv) {
    return {
        delay: zoneEnv.delay > 0 || globalEnv.delay === 0 ? zoneEnv.delay : globalEnv.delay,
        attack: zoneEnv.attack > 0.001 || globalEnv.attack === 0.001 ? zoneEnv.attack : globalEnv.attack,
        hold: zoneEnv.hold > 0 || globalEnv.hold === 0 ? zoneEnv.hold : globalEnv.hold,
        decay: zoneEnv.decay > 0 || globalEnv.decay === 0 ? zoneEnv.decay : globalEnv.decay,
        sustain: zoneEnv.sustain < 1.0 || globalEnv.sustain >= 1.0 ? zoneEnv.sustain : globalEnv.sustain,
        release: zoneEnv.release > 0.01 || globalEnv.release <= 0.01 ? zoneEnv.release : globalEnv.release,
    };
}

export default { extractEnvelope, mergeEnvelopes };
