/**
 * Generic RIFF file parser (player/sf2/riff.js)
 *
 * Parses a RIFF container into a structured chunk tree, decoupled from
 * any specific RIFF-based format (SF2, WAV, etc.).
 *
 * The returned tree has the shape:
 * {
 *   id:     'RIFF',
 *   size:   <payload size>,
 *   type:   'sfbk',            // form type for the top-level RIFF chunk
 *   dataOffset: <absolute offset of payload in the ArrayBuffer>,
 *   chunks: [ ... ]            // child chunks (LIST chunks nest here)
 * }
 *
 * Every non-container chunk has:
 *   { id, size, dataOffset, data }
 * where `data` is an ArrayBuffer slice of the payload (padded bytes excluded).
 * LIST chunks additionally have `.type` and `.chunks`.
 *
 * All offsets are absolute positions within the original ArrayBuffer, so the
 * returned tree can be consumed with a DataView over the original buffer.
 */

/**
 * Parse a RIFF file from an ArrayBuffer.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Object} chunk tree (see above)
 * @throws {Error} if the file is not RIFF/RIFX or is truncated
 */
export function parseRIFF(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const root = parseContainer(view, 0, arrayBuffer.byteLength);
    return root;
}

/**
 * Read a (optionally NUL-padded) ASCII/UTF-8 string from the view.
 * @param {DataView} view
 * @param {number} offset absolute offset
 * @param {number} length max byte length to read
 */
export function readString(view, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
        if (offset + i >= view.byteLength) break;
        const byte = view.getUint8(offset + i);
        if (byte === 0) break;
        str += String.fromCharCode(byte);
    }
    return str;
}

/**
 * Read a 4-char chunk id at `offset` (throws if outside the buffer).
 */
export function readFourCC(view, offset) {
    if (offset + 4 > view.byteLength) {
        throw new Error(`RIFF: truncated FourCC at offset ${offset}`);
    }
    let str = '';
    for (let i = 0; i < 4; i++) {
        str += String.fromCharCode(view.getUint8(offset + i));
    }
    return str;
}

/**
 * Parse a top-level RIFF container ('RIFF' / 'RIFX').
 * @param {DataView} view
 * @param {number} offset absolute offset of the container header
 * @param {number} bufferLength total buffer length
 */
function parseContainer(view, offset, bufferLength) {
    const start = offset;
    const id = readFourCC(view, offset);
    offset += 4;
    if (id !== 'RIFF' && id !== 'RIFX') {
        throw new Error(`Not a RIFF file (found "${id}")`);
    }

    // RIFF is little-endian, RIFX is big-endian (rare, but supported)
    const littleEndian = id === 'RIFF';
    if (offset + 4 > bufferLength) throw new Error('RIFF: truncated size field');
    const size = view.getUint32(offset, littleEndian);

    // Guard against absurd sizes / truncation
    const payloadStart = offset + 4;
    let payloadEnd = payloadStart + size;
    if (payloadEnd > bufferLength) payloadEnd = bufferLength;

    if (payloadStart + 4 > payloadEnd) {
        throw new Error('RIFF: missing form type');
    }
    const type = readFourCC(view, payloadStart);

    const root = {
        id,
        size,
        littleEndian,
        type,
        dataOffset: payloadStart + 4,
        chunks: [],
    };

    // Walk the payload (skip the 4-byte form type)
    let pos = payloadStart + 4;
    while (pos + 8 <= payloadEnd) {
        const chunk = parseChunk(view, pos, payloadEnd, littleEndian);
        root.chunks.push(chunk);
        pos = chunk.nextOffset;
    }

    // Sanity: consume the whole RIFF? Some writers pad trailing garbage,
    // so we stop at payloadEnd rather than requiring pos === payloadEnd.
    return root;
}

/**
 * Parse a single chunk (LIST/REC/format or plain data chunk).
 * Returns the parsed chunk plus `nextOffset` for iteration.
 */
function parseChunk(view, offset, end, littleEndian) {
    const chunkId = readFourCC(view, offset);
    offset += 4;
    if (offset + 4 > end) {
        throw new Error(`RIFF: truncated size for chunk "${chunkId}"`);
    }
    const size = view.getUint32(offset, littleEndian);
    offset += 4;

    const paddedSize = size + (size & 1); // chunks are word-aligned
    const dataStart = offset;
    const dataEnd = dataStart + size;
    const nextOffset = dataStart + paddedSize;

    if (chunkId === 'LIST' || chunkId === 'REC ') {
        if (dataEnd - dataStart < 4) {
            return {
                id: chunkId,
                size,
                dataOffset: dataStart,
                data: view.buffer.slice(dataStart, dataEnd),
                type: '',
                chunks: [],
                nextOffset: Math.min(nextOffset, end),
            };
        }
        const listType = readFourCC(view, dataStart);
        const chunks = [];
        let pos = dataStart + 4;
        while (pos + 8 <= dataEnd) {
            const sub = parseChunk(view, pos, dataEnd, littleEndian);
            chunks.push(sub);
            pos = sub.nextOffset;
        }
        return {
            id: chunkId,
            size,
            dataOffset: dataStart,
            type: listType,
            chunks,
            nextOffset: Math.min(nextOffset, end),
        };
    }

    return {
        id: chunkId,
        size,
        dataOffset: dataStart,
        data: view.buffer.slice(dataStart, dataEnd),
        nextOffset: Math.min(nextOffset, end),
    };
}

/**
 * Convenience: flatten a nested chunk tree into a list.
 * @param {Object} node chunk tree node
 * @param {boolean} recursive also descend into LIST children
 * @returns {Object[]} chunks (depth-first order)
 */
export function flattenChunks(node, recursive = true) {
    const out = [];
    const walk = (n) => {
        if (!n || !Array.isArray(n.chunks)) return;
        for (const c of n.chunks) {
            out.push(c);
            if (recursive && Array.isArray(c.chunks)) walk(c);
        }
    };
    walk(node);
    return out;
}

/**
 * Find the first LIST chunk with a given type (depth-first).
 */
export function findList(node, type) {
    if (!node || !Array.isArray(node.chunks)) return null;
    for (const c of node.chunks) {
        if (c.id === 'LIST' && c.type === type) return c;
        const found = findList(c, type);
        if (found) return found;
    }
    return null;
}

/**
 * Find the first chunk with a given id (depth-first).
 */
export function findChunk(node, id) {
    if (!node || !Array.isArray(node.chunks)) return null;
    for (const c of node.chunks) {
        if (c.id === id) return c;
        const found = findChunk(c, id);
        if (found) return found;
    }
    return null;
}

export default {
    parseRIFF,
    readString,
    readFourCC,
    flattenChunks,
    findList,
    findChunk,
};
