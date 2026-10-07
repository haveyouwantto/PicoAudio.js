/**
 * TinySoundFont — SoundFont container (JavaScript port)
 *
 * Ties the ported region builder (tsf-font.js) and voice renderer
 * (tsf-synth.js) together and adds the RIFF/hydra extraction that tsf_load
 * does in tsf.h. MIT licensed, see tsf-font.js for the upstream attribution.
 */

import { parseRIFF, findList } from './riff.js';
import {
    parseSampleHeaders, parseInstruments, parseBags, parseGenerators, parsePresetHeaders,
} from './io.js';
import { buildPresetRegions } from './tsf-font.js';
import { renderNote } from './tsf-synth.js';

const signed16 = (v) => (v > 32767 ? v - 65536 : v);

/** Generator record as the C union views it: shortAmount / wordAmount / range. */
const asGenUnion = (g) => ({
    type: g.type,
    amount: {
        shortAmount: signed16(g.amount),
        wordAmount: g.amount,
        range: { lo: g.amount & 0xff, hi: (g.amount >> 8) & 0xff },
    },
});

/** tsf_load: extract the sfbk chunks and decode the smpl chunk to float. */
export function readHydra(arrayBuffer) {
    const root = parseRIFF(arrayBuffer);
    if (root.type !== 'sfbk') {
        throw new Error(`Not a SoundFont file (form type "${root.type}")`);
    }
    const view = new DataView(arrayBuffer);
    const le = root.littleEndian;

    let sampleData = null;
    const sdta = findList(root, 'sdta');
    if (sdta) {
        for (const chunk of sdta.chunks) {
            if (chunk.id === 'smpl') { sampleData = chunk.data; break; }
        }
    }
    if (!sampleData) throw new Error('SF2: No sample data found');

    const hydra = {
        shdrs: [], insts: [], ibags: [], igens: [],
        phdrs: [], pbags: [], pgens: [],
    };
    const pdta = findList(root, 'pdta');
    if (pdta) {
        for (const chunk of pdta.chunks) {
            const o = chunk.dataOffset, s = chunk.size;
            switch (chunk.id) {
            case 'shdr': hydra.shdrs = parseSampleHeaders(view, o, s, le); break;
            case 'inst': hydra.insts = parseInstruments(view, o, s, le); break;
            case 'ibag': hydra.ibags = parseBags(view, o, s, le); break;
            case 'igen': hydra.igens = parseGenerators(view, o, s, le).map(asGenUnion); break;
            case 'phdr':
                hydra.phdrs = parsePresetHeaders(view, o, s, le).map((p) => ({
                    name: p.name, presetNum: p.presetNum, bank: p.bank, presetBagNdx: p.bagIndex,
                }));
                break;
            case 'pbag': hydra.pbags = parseBags(view, o, s, le); break;
            case 'pgen': hydra.pgens = parseGenerators(view, o, s, le).map(asGenUnion); break;
            default: break;
            }
        }
    }

    // tsf_load_samples: 16 bit samples -> float, divided by 32767 (not 32768).
    const count = Math.floor(sampleData.byteLength / 2);
    const samples = new Float32Array(count);
    const ints = new Int16Array(sampleData);
    for (let i = 0; i < count; i++) samples[i] = ints[i] / 32767.0;

    hydra.fontSampleCount = count;
    return { hydra, samples };
}

export class TSFFont {
    /**
     * @param {Object} hydra parsed SF2 header tables (see readHydra)
     * @param {Float32Array} samples decoded smpl chunk
     * @param {number} outSampleRate output sample rate (tsf_set_output)
     * @param {number} globalGainDB global gain in dB (tsf_set_output)
     */
    constructor(hydra, samples, outSampleRate = 44100, globalGainDB = 0) {
        this.samples = samples;
        this.shdrs = hydra.shdrs;
        this.presets = buildPresetRegions(hydra, samples.length);
        this.outSampleRate = outSampleRate;
        this.globalGainDB = globalGainDB;
        this.regionCount = this.presets.reduce((n, p) => n + (p ? p.regions.length : 0), 0);
    }

    /** tsf_get_presetindex: first preset matching bank + preset number. */
    getPresetIndex(bank, presetNumber) {
        for (let i = 0; i < this.presets.length; i++) {
            const p = this.presets[i];
            if (p && p.preset === presetNumber && p.bank === bank) return i;
        }
        return -1;
    }

    getPresetName(index) {
        const p = this.presets[index];
        return p ? p.name : null;
    }

    /** Sample header name of a region (diagnostics only). */
    getSampleName(sampleId) {
        const h = this.shdrs[sampleId];
        return h ? h.name : null;
    }

    /**
     * Render one note into interleaved stereo float32.
     * @param {number} maxFrames hard cap, the render stops earlier when all voices are done
     * @param {Array<{frame:number,value:number}>} [pitchBends] semitone steps
     * @param {Array<{frame:number,value:number}>} [panChanges] channel pan 0..1
     */
    renderNote(presetIndex, key, vel, noteOffFrames, maxFrames, pitchBends, panChanges) {
        return renderNote(this, presetIndex, key, vel, noteOffFrames, maxFrames, pitchBends, panChanges);
    }
}

/** Convenience: parse an .sf2 buffer straight into a TSFFont. */
export function loadTSFFont(arrayBuffer, outSampleRate = 44100, globalGainDB = 0) {
    const { hydra, samples } = readHydra(arrayBuffer);
    return new TSFFont(hydra, samples, outSampleRate, globalGainDB);
}

export default TSFFont;
