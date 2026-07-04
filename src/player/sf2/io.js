// IO helpers for reading RIFF/SF2 chunks
export function readString(dataView, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
        const charCode = dataView.getUint8(offset + i);
        if (charCode === 0) break;
        str += String.fromCharCode(charCode);
    }
    return str;
}

export function parseSampleHeaders(dataView, offset, size) {
    const headers = [];
    const count = Math.floor(size / 46);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * 46;
        const name = readString(dataView, pos, 20);
        const start = dataView.getUint32(pos + 20, true);
        const end = dataView.getUint32(pos + 24, true);
        const startLoop = dataView.getUint32(pos + 28, true);
        const endLoop = dataView.getUint32(pos + 32, true);
        const sampleRate = dataView.getUint32(pos + 36, true);
        const originalKey = dataView.getUint8(pos + 40);
        const correction = dataView.getInt8(pos + 41);
        const sampleLink = dataView.getUint16(pos + 42, true);
        const sampleType = dataView.getUint16(pos + 44, true);

        headers.push({ name, start, end, startLoop, endLoop, sampleRate, originalKey, correction, sampleLink, sampleType });
    }
    return headers;
}

export function parseInstruments(dataView, offset, size) {
    const instrs = [];
    const count = Math.floor(size / 22);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * 22;
        const name = readString(dataView, pos, 20);
        const bagIndex = dataView.getUint16(pos + 20, true);
        instrs.push({ name, bagIndex });
    }
    return instrs;
}

export function parseBags(dataView, offset, size) {
    const bags = [];
    const count = Math.floor(size / 4);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * 4;
        const genIndex = dataView.getUint16(pos, true);
        const modIndex = dataView.getUint16(pos + 2, true);
        bags.push({ genIndex, modIndex });
    }
    return bags;
}

export function parseGenerators(dataView, offset, size) {
    const gens = [];
    const count = Math.floor(size / 4);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * 4;
        const genType = dataView.getUint16(pos, true);
        const genAmount = dataView.getUint16(pos + 2, true);
        gens.push({ type: genType, amount: genAmount });
    }
    return gens;
}

export function parsePresetHeaders(dataView, offset, size) {
    const presets = [];
    const count = Math.floor(size / 38);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * 38;
        const name = readString(dataView, pos, 20);
        const presetNum = dataView.getUint16(pos + 20, true);
        const bank = dataView.getUint16(pos + 22, true);
        const bagIndex = dataView.getUint16(pos + 24, true);
        presets.push({ name, presetNum, bank, bagIndex });
    }
    return presets;
}

export default { readString, parseSampleHeaders, parseInstruments, parseBags, parseGenerators, parsePresetHeaders };
