/**
 * Independent SF2 parser (player/sf2/parser.js)
 * Returns only structured parsed data. No lookup or selection logic.
 *
 * The RIFF container traversal is delegated to riff.js — this module only
 * understands SF2-specific chunk layouts (shdr/inst/ibag/igen/phdr/pbag/pgen).
 */

import { SF2Gen, signed16 } from './constants.js';
import { readString, parseSampleHeaders, parseInstruments, parseBags, parseGenerators, parsePresetHeaders } from './io.js';
import { buildInstrumentSamples } from './builder.js';
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
                zones.push({ instrumentIndex, zoneBagIndex: b, keyRangeLo, keyRangeHi });
            }
        }
        presets.push({ name: preset.name, program: preset.presetNum, bank: preset.bank, isDrum, zones });
    }

    return { samples, instruments: instrumentSamples, presets, sampleData, presetBags, presetGens };
}
