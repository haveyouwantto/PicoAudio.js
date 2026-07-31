// IO helpers for reading RIFF/SF2 chunks
import { readString as riffReadString } from './riff.js';

export function readString(dataView, offset, length) {
    return riffReadString(dataView, offset, length);
}

const SHDR_SIZE = 46;
const INST_SIZE = 22;
const BAG_SIZE = 4;
const GEN_SIZE = 4;
const PHDR_SIZE = 38;

export function parseSampleHeaders(dataView, offset, size, littleEndian = true) {
    const headers = [];
    const count = Math.floor(size / SHDR_SIZE);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * SHDR_SIZE;
        const name = readString(dataView, pos, 20);
        const start = dataView.getUint32(pos + 20, littleEndian);
        const end = dataView.getUint32(pos + 24, littleEndian);
        const startLoop = dataView.getUint32(pos + 28, littleEndian);
        const endLoop = dataView.getUint32(pos + 32, littleEndian);
        const sampleRate = dataView.getUint32(pos + 36, littleEndian);
        const originalKey = dataView.getUint8(pos + 40);
        const correction = dataView.getInt8(pos + 41);
        const sampleLink = dataView.getUint16(pos + 42, littleEndian);
        const sampleType = dataView.getUint16(pos + 44, littleEndian);

        headers.push({ name, start, end, startLoop, endLoop, sampleRate, originalKey, correction, sampleLink, sampleType });
    }
    return headers;
}

export function parseInstruments(dataView, offset, size, littleEndian = true) {
    const instrs = [];
    const count = Math.floor(size / INST_SIZE);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * INST_SIZE;
        const name = readString(dataView, pos, 20);
        const bagIndex = dataView.getUint16(pos + 20, littleEndian);
        instrs.push({ name, bagIndex });
    }
    return instrs;
}

export function parseBags(dataView, offset, size, littleEndian = true) {
    const bags = [];
    const count = Math.floor(size / BAG_SIZE);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * BAG_SIZE;
        const genIndex = dataView.getUint16(pos, littleEndian);
        const modIndex = dataView.getUint16(pos + 2, littleEndian);
        bags.push({ genIndex, modIndex });
    }
    return bags;
}

export function parseGenerators(dataView, offset, size, littleEndian = true) {
    const gens = [];
    const count = Math.floor(size / GEN_SIZE);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * GEN_SIZE;
        const genType = dataView.getUint16(pos, littleEndian);
        const genAmount = dataView.getUint16(pos + 2, littleEndian);
        gens.push({ type: genType, amount: genAmount });
    }
    return gens;
}

export function parsePresetHeaders(dataView, offset, size, littleEndian = true) {
    const presets = [];
    const count = Math.floor(size / PHDR_SIZE);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * PHDR_SIZE;
        const name = readString(dataView, pos, 20);
        const presetNum = dataView.getUint16(pos + 20, littleEndian);
        const bank = dataView.getUint16(pos + 22, littleEndian);
        const bagIndex = dataView.getUint16(pos + 24, littleEndian);
        presets.push({ name, presetNum, bank, bagIndex });
    }
    return presets;
}

export default { readString, parseSampleHeaders, parseInstruments, parseBags, parseGenerators, parsePresetHeaders };