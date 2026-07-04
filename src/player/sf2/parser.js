/**
 * Independent SF2 parser (player/sf2/parser.js)
 * Returns only structured parsed data. No lookup or selection logic.
 */

import { SF2Gen, timecentsToSeconds, centibelsToGain } from './constants.js';
import { readString, parseSampleHeaders, parseInstruments, parseBags, parseGenerators, parsePresetHeaders } from './io.js';
import { buildInstrumentSamples } from './builder.js';
import { decodeSF2Sample as _decodeSF2Sample } from './decoder.js';

// IO helpers are provided by ./io.js

// Parser now performs a full low-level parse and returns raw tables.
// Provider will implement selection/merging/pairing logic.

export function parseSF2(arrayBuffer) {
    const dataView = new DataView(arrayBuffer);
    let offset = 0;
    const riffId = readString(dataView, offset, 4);
    if (riffId !== 'RIFF') throw new Error('Not a RIFF file');
    offset += 4;
    const riffSize = dataView.getUint32(offset, true);
    offset += 4;
    const riffType = readString(dataView, offset, 4);
    if (riffType !== 'sfbk') throw new Error('Not a SoundFont file');
    offset += 4;

    let sampleData = null;
    let sampleHeaders = [];
    let instruments = [];
    let presetHeaders = [];
    let presetBags = [];
    let presetGens = [];
    let instrumentBags = [];
    let instrumentGens = [];

    while (offset < arrayBuffer.byteLength) {
        const chunkId = readString(dataView, offset, 4);
        offset += 4;
        const chunkSize = dataView.getUint32(offset, true);
        offset += 4;
        const paddedSize = chunkSize + (chunkSize & 1);
        const chunkEnd = offset + paddedSize;

        if (chunkId === 'LIST') {
            const listType = readString(dataView, offset, 4);
            offset += 4;
            if (listType === 'sdta') {
                while (offset < chunkEnd) {
                    const subId = readString(dataView, offset, 4);
                    offset += 4;
                    const subSize = dataView.getUint32(offset, true);
                    offset += 4;
                    const subPadded = subSize + (subSize & 1);
                    if (subId === 'smpl') {
                        sampleData = arrayBuffer.slice(offset, offset + subSize);
                    }
                    offset += subPadded;
                }
            } else if (listType === 'pdta') {
                while (offset < chunkEnd) {
                    const subId = readString(dataView, offset, 4);
                    offset += 4;
                    const subSize = dataView.getUint32(offset, true);
                    offset += 4;
                    const subPadded = subSize + (subSize & 1);
                    switch (subId) {
                        case 'shdr': sampleHeaders = parseSampleHeaders(dataView, offset, subSize); break;
                        case 'inst': instruments = parseInstruments(dataView, offset, subSize); break;
                        case 'ibag': instrumentBags = parseBags(dataView, offset, subSize); break;
                        case 'igen': instrumentGens = parseGenerators(dataView, offset, subSize); break;
                        case 'phdr': presetHeaders = parsePresetHeaders(dataView, offset, subSize); break;
                        case 'pbag': presetBags = parseBags(dataView, offset, subSize); break;
                        case 'pgen': presetGens = parseGenerators(dataView, offset, subSize); break;
                    }
                    offset += subPadded;
                }
            } else {
                offset = chunkEnd;
            }
        } else {
            offset = chunkEnd;
        }
    }

    if (!sampleData) throw new Error('SF2: No sample data found');

    // Build structured instruments (zones -> samples)
    const instrumentSamples = buildInstrumentSamples(instruments, instrumentBags, instrumentGens, sampleHeaders, (v)=>v>32767?v-65536:v);

    // samples: attach id to headers for convenience
    const samples = sampleHeaders.map((shdr, idx) => ({ id: idx, ...shdr }));

    // presets: build a list of presets with zones that reference instrument indices
    const presets = [];
    for (let i = 0; i < presetHeaders.length - 1; i++) {
        const preset = presetHeaders[i];
        const nextBagIndex = presetHeaders[i + 1].bagIndex;
        const bagStart = preset.bagIndex;
        const bagEnd = nextBagIndex;
        const isDrum = preset.bank >= 120;
        const zones = [];
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
                    case SF2Gen.keyRange:
                        keyRangeLo = gen.amount & 0xFF;
                        keyRangeHi = (gen.amount >> 8) & 0xFF;
                        break;
                    case SF2Gen.instrument:
                        instrumentIndex = gen.amount;
                        break;
                }
            }
            if (instrumentIndex >= 0) {
                zones.push({ instrumentIndex, keyRangeLo, keyRangeHi });
            }
        }
        presets.push({ name: preset.name, program: preset.presetNum, bank: preset.bank, isDrum, zones });
    }

    return { samples, instruments: instrumentSamples, presets, sampleData };
}
export { timecentsToSeconds, centibelsToGain };
export const decodeSF2Sample = _decodeSF2Sample;

export default { parseSF2, decodeSF2Sample };
