import { SF2Gen, timecentsToSeconds, centibelsToGain, signed16 } from './constants.js';

// Parse a contiguous slice of generator records into a key/value map with meaningful values.
function parseGeneratorsKV(gens, genStart, genEnd) {
    const out = {};
    for (let i = genStart; i < genEnd && i < gens.length; i++) {
        const gen = gens[i];
        const t = gen.type;
        const a = gen.amount & 0xFFFF;
        const s = signed16(a);
        // common derived values for any generator
        const derived = { raw: a, signed: s, asSeconds: timecentsToSeconds(s), asGain: centibelsToGain(s) };
        switch (t) {
            // sample address offsets (in sample frames)
            case 0: // startAddrsOffset
                out.startAddrsOffset = signed16(a);
                break;
            case 1: // endAddrsOffset
                out.endAddrsOffset = signed16(a);
                break;
            case 2: // startLoopAddrsOffset
                out.startLoopAddrsOffset = signed16(a);
                break;
            case 3: // endLoopAddrsOffset
                out.endLoopAddrsOffset = signed16(a);
                break;
            case 4: // startAddrsCoarseOffset
                out.startAddrsCoarseOffset = signed16(a);
                break;
            case 12: // endAddrsCoarseOffset
                out.endAddrsCoarseOffset = signed16(a);
                break;
            case 45: // startLoopAddrsCoarseOffset
                out.startLoopAddrsCoarseOffset = signed16(a);
                break;

            // pitch / modulation amounts (cents)
            case SF2Gen.coarseTune:
                out.coarseTune = s;
                out.coarseTune_semitones = s / 100.0;
                break;
            case SF2Gen.fineTune:
                out.fineTune = s;
                out.fineTune_semitones = s / 100.0;
                break;
            case 5: // modLFOToPitch (cents)
                out.modLFOToPitch_cents = s;
                out.modLFOToPitch_semitones = s / 100.0;
                break;
            case 6: // vibLFOToPitch
                out.vibLFOToPitch_cents = s;
                out.vibLFOToPitch_semitones = s / 100.0;
                break;
            case 7: // modEnvToPitch
                out.modEnvToPitch_cents = s;
                out.modEnvToPitch_semitones = s / 100.0;
                break;

            // filter
            case 8: // initialFilterFc (cents)
                out.initialFilterFc_cents = s;
                out.initialFilterFc_hz = 8.176 * Math.pow(2, s / 1200);
                break;
            case 9: // initialFilterQ
                out.initialFilterQ = s;
                break;
            case 10: // modLFOToFilterFc
                out.modLFOToFilterFc = s;
                break;
            case 11: // modEnvToFilterFc
                out.modEnvToFilterFc = s;
                break;

            // volume/mix
            case 13: // modLFOToVolEnv
                out.modLFOToVolEnv = s;
                break;
            case 15: // chorusSend
                out.chorusSend = a; // unitless (0-1000 typical)
                break;
            case 16: // reverbSend
                out.reverbSend = a;
                break;
            case SF2Gen.initialPan:
                out.pan = a & 0xFF;
                break;

            // LFO / VIB / MOD timings and freqs
            case 21: // delayModLFO (timecents)
                out.delayModLFO = timecentsToSeconds(s);
                break;
            case 22: // freqModLFO (cents -> interpret as period seconds & Hz)
                out.freqModLFO_timecents = s;
                out.freqModLFO_period = timecentsToSeconds(s);
                out.freqModLFO_hz = 1 / (out.freqModLFO_period || 1e-9);
                break;
            case 23: // delayVibLFO
                out.delayVibLFO = timecentsToSeconds(s);
                break;
            case 24: // freqVibLFO
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
            case SF2Gen.delayVolEnv:
                out.delayVolEnv = timecentsToSeconds(s);
                break;
            case SF2Gen.attackVolEnv:
                out.attackVolEnv = Math.max(0.001, timecentsToSeconds(s));
                break;
            case SF2Gen.holdVolEnv:
                out.holdVolEnv = timecentsToSeconds(s);
                break;
            case SF2Gen.decayVolEnv:
                out.decayVolEnv = timecentsToSeconds(s);
                break;
            case SF2Gen.sustainVolEnv:
                out.sustainVolEnv_cb = s;
                out.sustainVolEnv = centibelsToGain(s);
                break;
            case SF2Gen.releaseVolEnv:
                out.releaseVolEnv = Math.max(0.001, timecentsToSeconds(s));
                break;
            case 39: out.keyNumToVolEnvHold = s; break;
            case 40: out.keyNumToVolEnvDecay = s; break;

            case SF2Gen.instrument:
                out.instrument = a;
                break;
            case SF2Gen.keyRange:
                out.keyRange = [a & 0xFF, (a >> 8) & 0xFF];
                break;
            case SF2Gen.velRange:
                out.velRange = [a & 0xFF, (a >> 8) & 0xFF];
                break;

            case SF2Gen.initialAttenuation:
                out.initialAttenuation_cb = s;
                out.initialAttenuation_gain = centibelsToGain(s);
                break;

            case SF2Gen.sampleID:
                out.sampleID = a;
                break;
            case SF2Gen.sampleModes:
                out.sampleModes = a;
                break;
            case 41: // instrument (duplicate)
                out.instrument = a;
                break;
            case SF2Gen.overridingRootKey:
                out.rootKey = a & 0xFF;
                break;

            default:
                // Unknown: provide structured fallback with numeric and derived fields.
                out[`gen_${t}`] = derived;
                break;
        }
    }
    return out;
}

export function parseGenRange(gens, genStart, genEnd, signed16) {
    const result = {
        sampleId: -1,
        keyRangeLo: 0, keyRangeHi: 127,
        velRangeLo: 0, velRangeHi: 127,
        rootKey: -1,
        sampleModes: -1,
        coarseTune: 0, fineTune: 0,
        initialAttenuation: 0,
        pan: 64,
    };
    for (let g = genStart; g < genEnd && g < gens.length; g++) {
        const gen = gens[g];
        switch (gen.type) {
            case 53: result.sampleId = gen.amount; break;
            case 43: result.keyRangeLo = gen.amount & 0xFF; result.keyRangeHi = (gen.amount >> 8) & 0xFF; break;
            case 44: result.velRangeLo = gen.amount & 0xFF; result.velRangeHi = (gen.amount >> 8) & 0xFF; break;
            case 58: result.rootKey = gen.amount; break;
            case 54: result.sampleModes = gen.amount; break;
            case 51: result.coarseTune = signed16(gen.amount); break;
            case 52: result.fineTune = signed16(gen.amount); break;
            case 48: result.initialAttenuation = signed16(gen.amount); break;
            case 17: result.pan = gen.amount & 0xFF; break;
        }
    }
    return result;
}

export function buildInstrumentSamples(instruments, instrumentBags, instrumentGens, sampleHeaders, signed16) {
    const result = [];
    for (let i = 0; i < instruments.length - 1; i++) {
        const inst = instruments[i];
        const nextBagIndex = instruments[i + 1].bagIndex;
        const bagStart = inst.bagIndex;
        const bagEnd = nextBagIndex;
        let globalGens = null;
        let firstSampleZone = bagStart;
        for (let b = bagStart; b < bagEnd; b++) {
            const bag = instrumentBags[b];
            const nextBag = (b + 1 < instrumentBags.length) ? instrumentBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : instrumentGens.length;
                let hasSample = false;
            for (let g = genStart; g < genEnd && g < instrumentGens.length; g++) {
                if (instrumentGens[g].type === 53) { hasSample = true; break; }
            }
            if (!hasSample) {
                    globalGens = parseGenRange(instrumentGens, genStart, genEnd, signed16);
                    // attach parsed generators KV map for editor/provider use
                    globalGens.generators = parseGeneratorsKV(instrumentGens, genStart, genEnd);
                firstSampleZone = b + 1;
            } else {
                firstSampleZone = b;
                break;
            }
        }
        if (!globalGens) {
            globalGens = { sampleId: -1, keyRangeLo:0, keyRangeHi:127, velRangeLo:0, velRangeHi:127, rootKey:-1, sampleModes:-1, _envelope:{delay:0,attack:0.001,hold:0,decay:0,sustain:1.0,release:0.01} };
        }
        const samples = [];
        for (let b = firstSampleZone; b < bagEnd; b++) {
            const bag = instrumentBags[b];
            const nextBag = (b + 1 < instrumentBags.length) ? instrumentBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : instrumentGens.length;
            const zone = parseGenRange(instrumentGens, genStart, genEnd, signed16);
            // attach parsed generators KV for this zone
            zone.generators = parseGeneratorsKV(instrumentGens, genStart, genEnd);
            if (zone.sampleId < 0) continue;
            if (zone.sampleId >= sampleHeaders.length) continue;
            const shdr = sampleHeaders[zone.sampleId];
            const loopMode = zone.sampleModes >= 0 ? zone.sampleModes : globalGens.sampleModes >= 0 ? globalGens.sampleModes : 0;
            const rootKey = zone.rootKey >= 0 ? zone.rootKey : globalGens.rootKey >= 0 ? globalGens.rootKey : shdr.originalKey;
            const velLo = zone.velRangeLo !== 0 ? zone.velRangeLo : globalGens.velRangeLo;
            const velHi = zone.velRangeHi !== 127 ? zone.velRangeHi : globalGens.velRangeHi;
            // Do not compute gain or merged envelope here; provider/editor will interpret original generators.
            const coarseTune = zone.coarseTune !== 0 ? zone.coarseTune : (globalGens.coarseTune || 0);
            const fineTune = zone.fineTune !== 0 ? zone.fineTune : (globalGens.fineTune || 0);
            samples.push({
                sampleId: zone.sampleId,
                keyRangeLo: zone.keyRangeLo,
                keyRangeHi: zone.keyRangeHi,
                velRangeLo: velLo,
                velRangeHi: velHi,
                rootKey,
                correction: shdr.correction,
                coarseTune,
                fineTune,
                sampleRate: shdr.sampleRate,
                startLoop: shdr.startLoop,
                endLoop: shdr.endLoop,
                sampleStart: shdr.start,
                sampleEnd: shdr.end,
                loopMode,
                // include parsed generators for editor/provider
                generators: zone.generators,
                globalGenerators: globalGens.generators,
                pan: (zone.pan != null) ? zone.pan : (globalGens.pan != null ? globalGens.pan : 64),
            });
        }
        result.push({ name: inst.name, samples });
    }
    return result;
}

export function buildProgramMap(presetHeaders, presetBags, presetGens, instrumentSamples) {
    const programMap = new Map();
    for (let i = 0; i < presetHeaders.length - 1; i++) {
        const preset = presetHeaders[i];
        const nextBagIndex = presetHeaders[i + 1].bagIndex;
        const bagStart = preset.bagIndex;
        const bagEnd = nextBagIndex;
        const isDrum = preset.bank >= 120;
        for (let b = bagStart; b < bagEnd; b++) {
            const bag = presetBags[b];
            const nextBag = (b + 1 < presetBags.length) ? presetBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : presetGens.length;
            let instrumentIndex = -1;
            let keyRangeLo = 0;
            let keyRangeHi = 127;
            for (let g = genStart; g < genEnd && g < presetGens.length; g++) {
                const gen = presetGens[g];
                switch (gen.type) {
                    case 43:
                        keyRangeLo = gen.amount & 0xFF;
                        keyRangeHi = (gen.amount >> 8) & 0xFF;
                        break;
                    case 41:
                        instrumentIndex = gen.amount;
                        break;
                }
            }
            if (instrumentIndex >= 0 && instrumentIndex < instrumentSamples.length) {
                const instSamples = instrumentSamples[instrumentIndex];
                if (instSamples.samples.length > 0) {
                    const key = isDrum ? `drum_${preset.bank}:${preset.presetNum}` : `${preset.bank}:${preset.presetNum}`;
                    if (!programMap.has(key)) {
                        programMap.set(key, { name: preset.name, program: preset.presetNum, bank: preset.bank, isDrum, samples: [] });
                    }
                    programMap.get(key).samples.push(...instSamples.samples);
                }
            }
        }
    }
    return programMap;
}

export default { buildInstrumentSamples, buildProgramMap };
