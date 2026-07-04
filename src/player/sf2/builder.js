import { extractEnvelope, mergeEnvelopes } from './envelope.js';
import { centibelsToGain } from './constants.js';

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
                globalGens._envelope = extractEnvelope(instrumentGens, genStart, genEnd);
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
            const zoneEnv = extractEnvelope(instrumentGens, genStart, genEnd);
            if (zone.sampleId < 0) continue;
            if (zone.sampleId >= sampleHeaders.length) continue;
            const shdr = sampleHeaders[zone.sampleId];
            const loopMode = zone.sampleModes >= 0 ? zone.sampleModes : globalGens.sampleModes >= 0 ? globalGens.sampleModes : 0;
            const rootKey = zone.rootKey >= 0 ? zone.rootKey : globalGens.rootKey >= 0 ? globalGens.rootKey : shdr.originalKey;
            const velLo = zone.velRangeLo !== 0 ? zone.velRangeLo : globalGens.velRangeLo;
            const velHi = zone.velRangeHi !== 127 ? zone.velRangeHi : globalGens.velRangeHi;
            const attenuationCb = zone.initialAttenuation !== 0 ? zone.initialAttenuation : (globalGens.initialAttenuation || 0);
            const gain = centibelsToGain(attenuationCb);
            const merged = mergeEnvelopes(zoneEnv, globalGens._envelope);
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
                envelope: merged,
                gain,
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
