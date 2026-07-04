// SF2 constants and small helpers
export const SF2Gen = {
    keyRange:        43,
    velRange:        44,
    instrument:      41,
    sampleID:        53,
    sampleModes:     54,
    coarseTune:      51,
    fineTune:        52,
    scaleTuning:     38,
    initialPan:      17,
    overridingRootKey: 58,
    delayVolEnv:     33,
    attackVolEnv:    34,
    holdVolEnv:      35,
    decayVolEnv:     36,
    sustainVolEnv:   37,
    releaseVolEnv:   38,
    initialAttenuation: 48,
};

export function timecentsToSeconds(tc) {
    if (tc > 32767) tc -= 65536;
    return Math.pow(2, tc / 1200);
}

export function centibelsToGain(cb) {
    if (cb <= 0) return 1.0;
    return Math.pow(10, cb / -200);
}

export function signed16(v) { return v > 32767 ? v - 65536 : v; }

export default { SF2Gen, timecentsToSeconds, centibelsToGain, signed16 };
