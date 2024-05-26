
let waveCache = [...Array(6)].map(() => []);

let buffer = null;
let pointers = [];

/**
 * @param {AudioContext} ctx 
 * @param {ArrayBuffer} arrayBuffer 
 */
function parseSamples(arrayBuffer) {
    buffer = arrayBuffer
    var dataView = new DataView(arrayBuffer);
    var instruments = [];

    var off = 0;

    for (let o = 0; o < 5; o++) {
        var octaveData = []
        instruments.push(octaveData)
        for (let i = 0; i < 128; i++) {
            const len = dataView.getInt32(off, true);
            off += 4;
            instruments[o][i] = [off, len];

            off += len;
        }
    }

    instruments.push([])
    for (let i = 0; i < 128; i++) {
        const len = dataView.getInt32(off, true);
        off += 4;
        instruments[5][i] = [off, len];

        off += len;
    }

    return instruments;
}

export function loadSamples(buffer) {
    pointers = parseSamples(buffer);
    waveCache = [...Array(6)].map(() => []);
}

async function decodeSample(ctx, octave, instId) {
    try {
        const ptr = pointers[octave][instId];
        const sample = buffer.slice(ptr[0], ptr[0] + ptr[1])
        return ctx.decodeAudioData(sample)
    } catch (e) {
        console.warn(e)
        return null;
    }
}

// Get the waveform for a specific instrument and octave (default octave is 2)
export async function getSample(ctx, instId, octave = 2) {
    if (waveCache[octave] && waveCache[octave][instId]) {
        // If cached, return the cached waveform
        return waveCache[octave][instId];
    }
    const decoded = decodeSample(ctx, octave, instId)
    if (decoded) {
        waveCache[octave][instId] = decoded;
    }
    return decoded;

}

export async function getDrumSample(ctx, key) {
    return getSample(ctx, key, 5)
}