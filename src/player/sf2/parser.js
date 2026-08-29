/**
 * Independent SF2 parser (player/sf2/parser.js)
 * Returns only structured parsed data. No lookup or selection logic.
 *
 * The RIFF container traversal is delegated to riff.js — this module only
 * understands SF2-specific chunk layouts (shdr/inst/ibag/igen/phdr/pbag/pgen).
 */

import { signed16 } from './constants.js';
import { readString, parseSampleHeaders, parseInstruments, parseBags, parseGenerators, parsePresetHeaders } from './io.js';
import { buildInstrumentSamples, parseGeneratorsKV } from './builder.js';
import { decodeSF2Sample } from './decoder.js';
import { parseRIFF, findList, readString as riffReadString } from './riff.js';

export { decodeSF2Sample };

/**
 * Parse a SoundFont 2 (.sf2) file.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Object} { samples, instruments, presets, sampleData }
 */
export function parseSF2(arrayBuffer) {
    const root = parseRIFF(arrayBuffer);
    if (root.type !== 'sfbk') {
        throw new Error(`Not a SoundFont file (form type "${root.type}")`);
    }

    const dataView = new DataView(arrayBuffer);
    const littleEndian = root.littleEndian;

    // --- sdta: raw sample data chunk -----------------------------------
    const sdtaList = findList(root, 'sdta');
    let sampleData = null;
    if (sdtaList) {
        for (const chunk of sdtaList.chunks) {
            if (chunk.id === 'smpl') {
                sampleData = chunk.data;
                break;
            }
            // 24-bit sf2 variants may use the 'sm24' chunk alongside 'smpl';
            // we only consume the 16-bit 'smpl' payload.
        }
    }
    if (!sampleData) throw new Error('SF2: No sample data found');

    // --- pdta: header/index chunks -------------------------------------
    let sampleHeaders = [];
    let instruments = [];
    let instrumentBags = [];
    let instrumentGens = [];
    let presetHeaders = [];
    let presetBags = [];
    let presetGens = [];

    const pdtaList = findList(root, 'pdta');
    if (pdtaList) {
        for (const chunk of pdtaList.chunks) {
            const o = chunk.dataOffset;
            const s = chunk.size;
            switch (chunk.id) {
                case 'shdr': sampleHeaders  = parseSampleHeaders(dataView, o, s, littleEndian); break;
                case 'inst': instruments    = parseInstruments(dataView, o, s, littleEndian); break;
                case 'ibag': instrumentBags = parseBags(dataView, o, s, littleEndian); break;
                case 'igen': instrumentGens = parseGenerators(dataView, o, s, littleEndian); break;
                case 'phdr': presetHeaders  = parsePresetHeaders(dataView, o, s, littleEndian); break;
                case 'pbag': presetBags     = parseBags(dataView, o, s, littleEndian); break;
                case 'pgen': presetGens     = parseGenerators(dataView, o, s, littleEndian); break;
                default: break;
            }
        }
    }

    // Build structured instruments (zones -> samples)
    const instrumentSamples = buildInstrumentSamples(instruments, instrumentBags, instrumentGens, sampleHeaders, signed16);

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
        let globalGenerators = null;
        for (let b = bagStart; b < bagEnd; b++) {
            const bag = presetBags[b];
            const nextBag = (b + 1 < presetBags.length) ? presetBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : presetGens.length;
            const generators = parseGeneratorsKV(presetGens, genStart, genEnd);
            const instrumentIndex = generators.instrument != null ? generators.instrument : -1;
            let keyRangeLo = 0;
            let keyRangeHi = 127;
            let velRangeLo = 0;
            let velRangeHi = 127;
            if (generators.keyRange) [keyRangeLo, keyRangeHi] = generators.keyRange;
            if (generators.velRange) [velRangeLo, velRangeHi] = generators.velRange;
            if (instrumentIndex >= 0) {
                zones.push({ instrumentIndex, zoneBagIndex: b, keyRangeLo, keyRangeHi, velRangeLo, velRangeHi, generators });
            } else if (zones.length === 0 && !globalGenerators) {
                // Per SF2, only the first preset zone may be global (it has no
                // instrument generator).  Preserve it for later composition.
                globalGenerators = generators;
            }
        }
        presets.push({ name: preset.name, program: preset.presetNum, bank: preset.bank, isDrum, globalGenerators, zones });
    }

    return { samples, instruments: instrumentSamples, presets, sampleData, presetBags, presetGens };
}
