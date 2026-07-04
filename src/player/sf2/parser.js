/**
 * Independent SF2 parser (player/sf2/parser.js)
 * Returns only structured parsed data. No lookup or selection logic.
 */

import { SF2Gen, timecentsToSeconds, centibelsToGain } from './constants.js';
import { readString, parseSampleHeaders, parseInstruments, parseBags, parseGenerators, parsePresetHeaders } from './io.js';
import { extractEnvelope, mergeEnvelopes } from './envelope.js';
import { buildInstrumentSamples as _buildInstrumentSamples, buildProgramMap as _buildProgramMap } from './builder.js';
import { decodeSF2Sample as _decodeSF2Sample } from './decoder.js';

// IO helpers are provided by ./io.js

// Re-use builder and envelope modules for clarity.
// The builder exports buildInstrumentSamples and buildProgramMap already.
const buildInstrumentSamples = _buildInstrumentSamples;
const buildProgramMap = _buildProgramMap;

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

    const instrumentSamples = buildInstrumentSamples(instruments, instrumentBags, instrumentGens, sampleHeaders, (v)=>v>32767?v-65536:v);
    const programSamples = buildProgramMap(presetHeaders, presetBags, presetGens, instrumentSamples);

    const sampleMeta = {};
    for (let instIdx = 0; instIdx < instrumentSamples.length; instIdx++) {
        const inst = instrumentSamples[instIdx];
        if (!inst || !inst.samples) continue;
        for (const s of inst.samples) {
            if (s && typeof s.sampleId === 'number') {
                sampleMeta[s.sampleId] = { pan: s.pan != null ? s.pan : 64, instrumentIndex: instIdx };
            }
        }
    }

    return { sampleData, sampleHeaders, programSamples, instruments, instrumentSamples, sampleMeta };
}
export { timecentsToSeconds, centibelsToGain };
export const decodeSF2Sample = _decodeSF2Sample;

export default { parseSF2, decodeSF2Sample };
