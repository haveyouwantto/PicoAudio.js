// SF2 constants and small helpers

// SoundFont 2.04 generator types (SFSpec 2.01 §9.2 / §8.1)
export const SF2Gen = {
    // Sample / pitch / tuning
    startAddrsOffset:         0,
    endAddrsOffset:           1,
    startLoopAddrsOffset:     2,
    endLoopAddrsOffset:       3,
    startAddrsCoarseOffset:   4,
    modLfoToPitch:            5,
    vibLfoToPitch:            6,
    modEnvToPitch:            7,
    initialFilterFc:          8,
    initialFilterQ:           9,
    modLfoToFilterFc:        10,
    modEnvToFilterFc:        11,
    endAddrsCoarseOffset:    12,
    modLfoToVolume:          13,
    chorusEffectsSend:       15,
    reverbEffectsSend:       16,
    pan:                     17,
    delayModLFO:             21,
    freqModLFO:              22,
    delayVibLFO:             23,
    freqVibLFO:              24,
    delayModEnv:             25,
    attackModEnv:            26,
    holdModEnv:              27,
    decayModEnv:             28,
    sustainModEnv:           29,
    releaseModEnv:           30,
    keynumToModEnvHold:      31,
    keynumToModEnvDecay:     32,
    delayVolEnv:             33,
    attackVolEnv:            34,
    holdVolEnv:              35,
    decayVolEnv:             36,
    sustainVolEnv:           37,
    releaseVolEnv:           38,
    keynumToVolEnvHold:      39,
    keynumToVolEnvDecay:     40,
    instrument:              41,
    reserved1:               42,
    keyRange:                43,
    velRange:                44,
    startLoopAddrsCoarseOffset: 45,
    keynum:                  46,
    velocity:                47,
    initialAttenuation:      48,
    reserved2:               49,
    endLoopAddrsCoarseOffset: 50,
    coarseTune:              51,
    fineTune:                52,
    sampleID:                53,
    sampleModes:             54,
    reserved4:               55,
    scaleTuning:             56,
    exclusiveClass:          57,
    overridingRootKey:       58,
};

export function timecentsToSeconds(tc) {
    if (tc > 32767) tc -= 65536;
    return Math.pow(2, tc / 1200);
}

export function centibelsToGain(cb) {
    // Faithful SF2 conversion: centibels of attenuation → linear gain.
    // Do NOT clamp negative values to 1.0 — some fonts encode amplification
    // as negative attenuation (FluidSynth honors this); the renderer's
    // per-layer safety cap guards the output.
    return Math.pow(10, cb / -200);
}

export function signed16(v) { return v > 32767 ? v - 65536 : v; }

// SF2 sample type flags (shdr.sampleType)
export const SF2SampleType = {
    monoSample:    1,
    rightSample:   2,
    leftSample:    4,
    linkedSample:  8,
    romMonoSample: 0x8001,
    romRightSample: 0x8002,
    romLeftSample: 0x8004,
    romLinkedSample: 0x8008,
};

export default { SF2Gen, SF2SampleType, timecentsToSeconds, centibelsToGain, signed16 };
