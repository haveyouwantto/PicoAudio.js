import { SF2Gen, timecentsToSeconds, centibelsToGain, signed16 } from './constants.js';

/**
 * Parse a contiguous slice of generator records into a key/value map with derived values.
 * This is the single source of truth for all generator value extraction.
 */
export function parseGeneratorsKV(gens, genStart, genEnd) {
    const out = {};
    for (let i = genStart; i < genEnd && i < gens.length; i++) {
        const gen = gens[i];
        const t = gen.type;
        const a = gen.amount & 0xFFFF;
        const s = signed16(a);
        const derived = { raw: a, signed: s, asSeconds: timecentsToSeconds(s), asGain: centibelsToGain(s) };
        switch (t) {
            // sample address offsets (in sample frames)
            case 0:  out.startAddrsOffset = signed16(a); break;
            case 1:  out.endAddrsOffset = signed16(a); break;
            case 2:  out.startLoopAddrsOffset = signed16(a); break;
            case 3:  out.endLoopAddrsOffset = signed16(a); break;
            case 4:  out.startAddrsCoarseOffset = signed16(a); break;
            case 12: out.endAddrsCoarseOffset = signed16(a); break;
            case 45: out.startLoopAddrsCoarseOffset = signed16(a); break;

            // pitch / modulation amounts (cents)
            case SF2Gen.coarseTune:
                out.coarseTune = s;
                out.coarseTune_semitones = s / 100.0;
                break;
            case SF2Gen.fineTune:
                out.fineTune = s;
                out.fineTune_semitones = s / 100.0;
                break;
            case 5:  out.modLFOToPitch_cents = s; out.modLFOToPitch_semitones = s / 100.0; break;
            case 6:  out.vibLFOToPitch_cents = s; out.vibLFOToPitch_semitones = s / 100.0; break;
            case 7:  out.modEnvToPitch_cents = s; out.modEnvToPitch_semitones = s / 100.0; break;

            // filter
            case 8:  out.initialFilterFc_cents = s; out.initialFilterFc_hz = 8.176 * Math.pow(2, s / 1200); break;
            case 9:  out.initialFilterQ = s; break;
            case 10: out.modLFOToFilterFc = s; break;
            case 11: out.modEnvToFilterFc = s; break;

            // volume/mix
            case 13: out.modLFOToVolEnv = s; break;
            case 15: out.chorusSend = a; break;
            case 16: out.reverbSend = a; break;
            case SF2Gen.initialPan:
                out.pan = a & 0xFF;
                break;

            // LFO / VIB / MOD timings and freqs
            case 21: out.delayModLFO = timecentsToSeconds(s); break;
            case 22:
                out.freqModLFO_timecents = s;
                out.freqModLFO_period = timecentsToSeconds(s);
                out.freqModLFO_hz = 1 / (out.freqModLFO_period || 1e-9);
                break;
            case 23: out.delayVibLFO = timecentsToSeconds(s); break;
            case 24:
                out.freqVibLFO_timecents = s;
                out.freqVibLFO_period = timecentsToSeconds(s);
                out.freqVibLFO_hz = 1 / (out.freqVibLFO_period || 1e-9);
                break;

            // modulation envelope (timecents)
            case 25: out.delayModEnv = timecentsToSeconds(s); break;
            case 26: out.attackModEnv = timecentsToSeconds(s); break;
            case 27: out.holdModEnv = timecentsToSeconds(s); break;
            case 28: out.decayModEnv = timecentsToSeconds(s); break;
            case 29: out.sustainModEnv_cb = s; out.sustainModEnv = centibelsToGain(s); break;
            case 30: out.releaseModEnv = timecentsToSeconds(s); break;
            case 31: out.keyNumToModEnvHold = s; break;
            case 32: out.keyNumToModEnvDecay = s; break;

            // volume envelope
            case SF2Gen.delayVolEnv:   out.delayVolEnv = timecentsToSeconds(s); break;
            case SF2Gen.attackVolEnv:  out.attackVolEnv = Math.max(0.001, timecentsToSeconds(s)); break;
            case SF2Gen.holdVolEnv:    out.holdVolEnv = timecentsToSeconds(s); break;
            case SF2Gen.decayVolEnv:   out.decayVolEnv = timecentsToSeconds(s); break;
            case SF2Gen.sustainVolEnv: out.sustainVolEnv_cb = s; out.sustainVolEnv = centibelsToGain(s); break;
            case SF2Gen.releaseVolEnv: out.releaseVolEnv = Math.max(0.001, timecentsToSeconds(s)); break;
            case 39: out.keyNumToVolEnvHold = s; break;
            case 40: out.keyNumToVolEnvDecay = s; break;

            case SF2Gen.instrument: out.instrument = a; break;
            case SF2Gen.keyRange:   out.keyRange = [a & 0xFF, (a >> 8) & 0xFF]; break;
            case SF2Gen.velRange:   out.velRange = [a & 0xFF, (a >> 8) & 0xFF]; break;

            case SF2Gen.initialAttenuation:
                out.initialAttenuation_cb = s;
                out.initialAttenuation_gain = centibelsToGain(s);
                break;

            case SF2Gen.sampleID:        out.sampleID = a; break;
            case SF2Gen.sampleModes:     out.sampleModes = a; break;
            case 41:                     out.instrument = a; break;
            case SF2Gen.overridingRootKey: out.rootKey = a & 0xFF; break;

            default:
                out[`gen_${t}`] = derived;
                break;
        }
    }
    return out;
}

export function buildInstrumentSamples(instruments, instrumentBags, instrumentGens, sampleHeaders, signed16) {
    const result = [];
    for (let i = 0; i < instruments.length - 1; i++) {
        const inst = instruments[i];
        const nextBagIndex = instruments[i + 1].bagIndex;
        const bagStart = inst.bagIndex;
        const bagEnd = nextBagIndex;
        let globalGenerators = null;
        let firstSampleZone = bagStart;

        // Find the global zone (bag without sampleID) and parse its generators
        for (let b = bagStart; b < bagEnd; b++) {
            const bag = instrumentBags[b];
            const nextBag = (b + 1 < instrumentBags.length) ? instrumentBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : instrumentGens.length;
            let hasSample = false;
            for (let g = genStart; g < genEnd && g < instrumentGens.length; g++) {
                if (instrumentGens[g].type === SF2Gen.sampleID) { hasSample = true; break; }
            }
            if (!hasSample) {
                globalGenerators = parseGeneratorsKV(instrumentGens, genStart, genEnd);
                firstSampleZone = b + 1;
            } else {
                firstSampleZone = b;
                break;
            }
        }

        const samples = [];
        for (let b = firstSampleZone; b < bagEnd; b++) {
            const bag = instrumentBags[b];
            const nextBag = (b + 1 < instrumentBags.length) ? instrumentBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : instrumentGens.length;
            const zoneGenerators = parseGeneratorsKV(instrumentGens, genStart, genEnd);

            const sampleId = zoneGenerators.sampleID;
            if (sampleId == null || sampleId < 0 || sampleId >= sampleHeaders.length) continue;

            samples.push({
                sampleId,
                generators: zoneGenerators,
            });
        }
        result.push({ name: inst.name, generators: globalGenerators, samples });
    }
    return result;
}

export default { parseGeneratorsKV, buildInstrumentSamples };