/**
 * SF2 (SoundFont 2) Parser
 * Parses standard SoundFont 2 files and provides sample data for audio playback.
 * 
 * SF2 Structure:
 *   RIFF ('sfbk')
 *     ├── LIST ('INFO')  - metadata (ignored for playback)
 *     ├── LIST ('sdta')  - sample data
 *     │   └── 'smpl'     - 16-bit PCM sample data
 *     └── LIST ('pdta')  - preset data (instrument definitions)
 *         ├── 'phdr'     - preset headers
 *         ├── 'pbag'     - preset bags
 *         ├── 'pmod'     - preset modulators
 *         ├── 'pgen'     - preset generators
 *         ├── 'inst'     - instrument headers
 *         ├── 'ibag'     - instrument bags
 *         ├── 'imod'     - instrument modulators
 *         ├── 'igen'     - instrument generators
 *         └── 'shdr'     - sample headers
 */

// SF2 Generator types
const SF2Gen = {
    // Sample mapping
    keyRange:        43,   // Key range (lo, hi)
    velRange:        44,   // Velocity range (lo, hi)
    instrument:      41,   // Instrument index (preset context) — NOT sampleID!
    sampleID:        53,   // Sample ID index (instrument context only)
    sampleModes:     54,   // Sample modes (loop flags)
    coarseTune:      51,   // Coarse tuning (semitones)
    fineTune:        52,   // Fine tuning (cents)
    scaleTuning:     38,   // Scale tuning (cents) — instrument context
    overridingRootKey: 58, // Overriding root key

    // Volume Envelope (timecents: 1 unit = 0.001 second? no, timecents: 1 = 2^(1/1200) second ratio)
    // SF2 timecents: value * 0.001 is the exponent of 2: time = 2^(value/1200)
    delayVolEnv:     33,   // Delay (timecents)
    attackVolEnv:    34,   // Attack (timecents)
    holdVolEnv:      35,   // Hold (timecents)
    decayVolEnv:     36,   // Decay (timecents)
    sustainVolEnv:   37,   // Sustain (0.1% units, 0-1000, centibels: 0=full, 1000=-100dB)
    releaseVolEnv:   38,   // Release (timecents) — same gen# as scaleTuning, context-dependent

    // Initial values
    initialAttenuation: 48, // Initial attenuation (centibels)
};

/**
 * Convert SF2 timecents to seconds
 * timecents: time = 2^(value / 1200)
 * @param {number} tc - Timecents value (16-bit signed)
 * @returns {number} Time in seconds
 */
function timecentsToSeconds(tc) {
    // Convert from signed 16-bit
    if (tc > 32767) tc -= 65536;
    return Math.pow(2, tc / 1200);
}

/**
 * Convert SF2 centibels to linear gain
 * cB: gain = 10^(cB / -200)
 * @param {number} cb - Centibels (0.1dB units)
 * @returns {number} Linear gain (0.0-1.0)
 */
function centibelsToGain(cb) {
    if (cb <= 0) return 1.0;
    return Math.pow(10, cb / -200);
}

/**
 * Parse an SF2 SoundFont file from an ArrayBuffer
 * @param {ArrayBuffer} arrayBuffer - The SF2 file data
 * @returns {Object} Parsed SF2 data with samples array and program map
 */
export function parseSF2(arrayBuffer) {
    const dataView = new DataView(arrayBuffer);
    let offset = 0;

    // Read RIFF header
    const riffId = readString(dataView, offset, 4);
    if (riffId !== 'RIFF') throw new Error('Not a RIFF file');
    offset += 4;
    const riffSize = dataView.getUint32(offset, true);
    offset += 4;
    const riffType = readString(dataView, offset, 4);
    if (riffType !== 'sfbk') throw new Error('Not a SoundFont file');
    offset += 4;

    // Parse chunks
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

        // Chunk size must be even-aligned
        const paddedSize = chunkSize + (chunkSize & 1);
        const chunkEnd = offset + paddedSize;

        if (chunkId === 'LIST') {
            const listType = readString(dataView, offset, 4);
            offset += 4;

            if (listType === 'sdta') {
                // Sample data section
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
                // Preset data section
                while (offset < chunkEnd) {
                    const subId = readString(dataView, offset, 4);
                    offset += 4;
                    const subSize = dataView.getUint32(offset, true);
                    offset += 4;
                    const subPadded = subSize + (subSize & 1);

                    switch (subId) {
                        case 'shdr':
                            sampleHeaders = parseSampleHeaders(dataView, offset, subSize);
                            break;
                        case 'inst':
                            instruments = parseInstruments(dataView, offset, subSize);
                            break;
                        case 'ibag':
                            instrumentBags = parseBags(dataView, offset, subSize);
                            break;
                        case 'igen':
                            instrumentGens = parseGenerators(dataView, offset, subSize);
                            break;
                        case 'phdr':
                            presetHeaders = parsePresetHeaders(dataView, offset, subSize);
                            break;
                        case 'pbag':
                            presetBags = parseBags(dataView, offset, subSize);
                            break;
                        case 'pgen':
                            presetGens = parseGenerators(dataView, offset, subSize);
                            break;
                        // pmod, imod - ignored for now
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

    // Build instrument -> sample mapping (includes envelope data)
    const instrumentSamples = buildInstrumentSamples(
        instruments, instrumentBags, instrumentGens, sampleHeaders
    );

    // Build program map: program number -> {samples, name, envelope}
    const programSamples = buildProgramMap(
        presetHeaders, presetBags, presetGens, instrumentSamples
    );

    return {
        sampleData,
        sampleHeaders,
        programSamples,
        instruments,
        instrumentSamples
    };
}

function readString(dataView, offset, length) {
    let str = '';
    for (let i = 0; i < length; i++) {
        const charCode = dataView.getUint8(offset + i);
        if (charCode === 0) break;
        str += String.fromCharCode(charCode);
    }
    return str;
}

/**
 * Parse sample headers (shdr)
 * Each sample header is 46 bytes
 */
function parseSampleHeaders(dataView, offset, size) {
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
        const correction = dataView.getInt8(pos + 41); // cents
        const sampleLink = dataView.getUint16(pos + 42, true);
        const sampleType = dataView.getUint16(pos + 44, true);

        headers.push({
            name,
            start,
            end,
            startLoop,
            endLoop,
            sampleRate,
            originalKey,
            correction,
            sampleLink,
            sampleType
        });
    }
    return headers;
}

/**
 * Parse instrument headers (inst)
 * Each instrument header is 22 bytes
 */
function parseInstruments(dataView, offset, size) {
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

/**
 * Parse bag records (ibag, pbag)
 * Each bag is 4 bytes
 */
function parseBags(dataView, offset, size) {
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

/**
 * Parse generator records (igen, pgen)
 * Each generator is 4 bytes
 */
function parseGenerators(dataView, offset, size) {
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

/**
 * Parse preset headers (phdr)
 * Each preset header is 38 bytes
 */
function parsePresetHeaders(dataView, offset, size) {
    const presets = [];
    const count = Math.floor(size / 38);
    for (let i = 0; i < count; i++) {
        const pos = offset + i * 38;
        const name = readString(dataView, pos, 20);
        const presetNum = dataView.getUint16(pos + 20, true);
        const bank = dataView.getUint16(pos + 22, true);
        const bagIndex = dataView.getUint16(pos + 24, true);
        // library, genre, morphology - unused
        presets.push({ name, presetNum, bank, bagIndex });
    }
    return presets;
}

/**
 * Extract volume envelope from a set of generators
 * @param {Array} gens - Array of generator objects {type, amount}
 * @param {number} genStart - Start index in gens
 * @param {number} genEnd - End index in gens
 * @returns {Object} {delay, attack, hold, decay, sustain, release} in seconds / gain
 */
function extractEnvelope(gens, genStart, genEnd) {
    const envelope = {
        delay: 0,      // seconds
        attack: 0.001, // seconds (minimum)
        hold: 0,       // seconds
        decay: 0,      // seconds
        sustain: 1.0,  // linear gain (1.0 = full)
        release: 0.01  // seconds (minimum)
    };

    for (let g = genStart; g < genEnd && g < gens.length; g++) {
        const gen = gens[g];
        switch (gen.type) {
            case SF2Gen.delayVolEnv:
                envelope.delay = timecentsToSeconds(gen.amount);
                break;
            case SF2Gen.attackVolEnv:
                envelope.attack = Math.max(0.001, timecentsToSeconds(gen.amount));
                break;
            case SF2Gen.holdVolEnv:
                envelope.hold = timecentsToSeconds(gen.amount);
                break;
            case SF2Gen.decayVolEnv:
                envelope.decay = timecentsToSeconds(gen.amount);
                break;
            case SF2Gen.sustainVolEnv:
                envelope.sustain = centibelsToGain(gen.amount);
                break;
            case SF2Gen.releaseVolEnv:
                // gen 38 is also scaleTuning; only treat as releaseVolEnv if value range
                // makes sense for envelope (> 0 timecents typically negative = fast release)
                envelope.release = Math.max(0.001, timecentsToSeconds(gen.amount));
                break;
        }
    }
    return envelope;
}

/**
 * Build instrument -> sample(s) mapping from instrument generators
 * Includes per-sample envelope data
 */
/**
 * Parse generators from a specific range and return an object with extracted values.
 * Used for both global and per-zone generators.
 */
/**
 * Convert SF2 signed 16-bit value (amount field = uint16)
 * SF2 stores signed values as uint16; values > 32767 are negative.
 */
function signed16(v) {
    return v > 32767 ? v - 65536 : v;
}

function parseGenRange(gens, genStart, genEnd) {
    const result = {
        sampleId: -1,
        keyRangeLo: 0,
        keyRangeHi: 127,
        velRangeLo: 0,
        velRangeHi: 127,
        rootKey: -1,
        sampleModes: -1,  // -1 means "not set" (inherit from global)
        coarseTune: 0,    // semitones
        fineTune: 0,      // cents
    };

    for (let g = genStart; g < genEnd && g < gens.length; g++) {
        const gen = gens[g];
        switch (gen.type) {
            case SF2Gen.sampleID:
                result.sampleId = gen.amount;
                break;
            case SF2Gen.keyRange:
                result.keyRangeLo = gen.amount & 0xFF;
                result.keyRangeHi = (gen.amount >> 8) & 0xFF;
                break;
            case SF2Gen.velRange:
                result.velRangeLo = gen.amount & 0xFF;
                result.velRangeHi = (gen.amount >> 8) & 0xFF;
                break;
            case SF2Gen.overridingRootKey:
                result.rootKey = gen.amount;
                break;
            case SF2Gen.sampleModes:
                result.sampleModes = gen.amount;
                break;
            case SF2Gen.coarseTune:
                result.coarseTune = signed16(gen.amount);
                break;
            case SF2Gen.fineTune:
                result.fineTune = signed16(gen.amount);
                break;
        }
    }
    return result;
}

function buildInstrumentSamples(instruments, instrumentBags, instrumentGens, sampleHeaders) {
    const result = [];

    for (let i = 0; i < instruments.length - 1; i++) {
        const inst = instruments[i];
        const nextBagIndex = instruments[i + 1].bagIndex;
        const bagStart = inst.bagIndex;
        const bagEnd = nextBagIndex;

        // ── Step 1: Find the global zone (first bag without sampleID)
        //    Its generators apply to all subsequent zones
        let globalGens = null;
        let firstSampleZone = bagStart;

        for (let b = bagStart; b < bagEnd; b++) {
            const bag = instrumentBags[b];
            const nextBag = (b + 1 < instrumentBags.length) ? instrumentBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : instrumentGens.length;

            // Check if this bag has a sampleID generator
            let hasSample = false;
            for (let g = genStart; g < genEnd && g < instrumentGens.length; g++) {
                if (instrumentGens[g].type === SF2Gen.sampleID) {
                    hasSample = true;
                    break;
                }
            }

            if (!hasSample) {
                // This is the global zone
                globalGens = parseGenRange(instrumentGens, genStart, genEnd);
                // Also extract envelope from global zone
                globalGens._envelope = extractEnvelope(instrumentGens, genStart, genEnd);
                firstSampleZone = b + 1;
            } else {
                // Stop after first non-global zone
                firstSampleZone = b;
                break;
            }
        }

        // Default global values if no global zone exists
        if (!globalGens) {
            globalGens = {
                sampleId: -1,
                keyRangeLo: 0,
                keyRangeHi: 127,
                velRangeLo: 0,
                velRangeHi: 127,
                rootKey: -1,
                sampleModes: -1,
                _envelope: { delay: 0, attack: 0.001, hold: 0, decay: 0, sustain: 1.0, release: 0.01 }
            };
        }

        // ── Step 2: Parse each sample zone, inheriting from global
        const samples = [];
        for (let b = firstSampleZone; b < bagEnd; b++) {
            const bag = instrumentBags[b];
            const nextBag = (b + 1 < instrumentBags.length) ? instrumentBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : instrumentGens.length;

            const zone = parseGenRange(instrumentGens, genStart, genEnd);
            const zoneEnv = extractEnvelope(instrumentGens, genStart, genEnd);

            // Skip if no sampleID (shouldn't happen in sample zones, but guard)
            if (zone.sampleId < 0) continue;
            if (zone.sampleId >= sampleHeaders.length) continue;

            const shdr = sampleHeaders[zone.sampleId];

            // Inherit from global where zone doesn't specify
            const loopMode = zone.sampleModes >= 0 ? zone.sampleModes : globalGens.sampleModes >= 0 ? globalGens.sampleModes : 0;
            const rootKey = zone.rootKey >= 0 ? zone.rootKey : globalGens.rootKey >= 0 ? globalGens.rootKey : shdr.originalKey;
            const velLo = zone.velRangeLo !== 0 ? zone.velRangeLo : globalGens.velRangeLo;
            const velHi = zone.velRangeHi !== 127 ? zone.velRangeHi : globalGens.velRangeHi;

            // Merge envelopes: zone values override global defaults
            const mergedEnv = {
                delay:   zoneEnv.delay   > 0 || globalGens._envelope.delay   === 0 ? zoneEnv.delay   : globalGens._envelope.delay,
                attack:  zoneEnv.attack  > 0.001 || globalGens._envelope.attack  === 0.001 ? zoneEnv.attack  : globalGens._envelope.attack,
                hold:    zoneEnv.hold    > 0 || globalGens._envelope.hold    === 0 ? zoneEnv.hold    : globalGens._envelope.hold,
                decay:   zoneEnv.decay   > 0 || globalGens._envelope.decay   === 0 ? zoneEnv.decay   : globalGens._envelope.decay,
                sustain: zoneEnv.sustain < 1.0 || globalGens._envelope.sustain >= 1.0 ? zoneEnv.sustain : globalGens._envelope.sustain,
                release: zoneEnv.release > 0.01 || globalGens._envelope.release <= 0.01 ? zoneEnv.release : globalGens._envelope.release,
            };

            // Merge coarseTune and fineTune from zone/global
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
                envelope: mergedEnv,
            });
        }
        result.push({ name: inst.name, samples });
    }
    return result;
}

/**
 * Build a MIDI program -> sample mapping from preset data
 * Returns: Map<programNumber, {samples: Array, name: string, envelope: Object}>
 */
function buildProgramMap(presetHeaders, presetBags, presetGens, instrumentSamples) {
    const programMap = new Map();

    for (let i = 0; i < presetHeaders.length - 1; i++) {
        const preset = presetHeaders[i];
        const nextBagIndex = presetHeaders[i + 1].bagIndex;
        const bagStart = preset.bagIndex;
        const bagEnd = nextBagIndex;

        // Skip drum kits (bank >= 120) for now — handled separately
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
                    case SF2Gen.keyRange:
                        keyRangeLo = gen.amount & 0xFF;
                        keyRangeHi = (gen.amount >> 8) & 0xFF;
                        break;
                    case SF2Gen.instrument:
                        instrumentIndex = gen.amount;
                        break;
                }
            }

            if (instrumentIndex >= 0 && instrumentIndex < instrumentSamples.length) {
                const instSamples = instrumentSamples[instrumentIndex];
                if (instSamples.samples.length > 0) {
                    const key = isDrum
                        ? `drum_${preset.bank}:${preset.presetNum}`
                        : `${preset.bank}:${preset.presetNum}`;
                    if (!programMap.has(key)) {
                        programMap.set(key, {
                            name: preset.name,
                            program: preset.presetNum,
                            bank: preset.bank,
                            isDrum,
                            samples: []
                        });
                    }
                    programMap.get(key).samples.push(...instSamples.samples);
                }
            }
        }
    }

    return programMap;
}

/**
 * Decode 16-bit signed PCM samples from SF2 sample data.
 * SF2 samples are stored as 16-bit signed integers, little-endian.
 * @param {ArrayBuffer} sampleData - The 'smpl' chunk data
 * @param {number} start - Start offset in sample points (not bytes)
 * @param {number} end - End offset in sample points (not bytes)
 * @returns {Float32Array} Decoded samples normalized to [-1, 1]
 */
export function decodeSF2Sample(sampleData, start, end) {
    const view = new DataView(sampleData);
    const length = end - start;
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        // Each sample point is 2 bytes (16-bit)
        const val = view.getInt16((start + i) * 2, true);
        result[i] = val / 32768;
    }
    return result;
}

/**
 * Find matching sample for a given program and key (note number)
 * @param {Map} programSamples - The program map from buildProgramMap()
 * @param {number} program - MIDI program number (0-127)
 * @param {number} key - MIDI key number (0-127)
 * @param {boolean} isDrum - Whether this is a drum channel
 * @returns {Object|null} Matching sample info or null
 */
export function findSample(programSamples, program, key, isDrum = false, bank = 0, velocity = 127) {
    const mapKey = isDrum ? `drum_${bank}:${program}` : `${bank}:${program}`;
    let entry = programSamples.get(mapKey);
    if (!entry) {
        entry = programSamples.get(isDrum ? `drum_${program}` : `${program}`) || null;
    }
    if (!entry) return null;

    const vel = Math.max(0, Math.min(127, velocity));
    let bestKeyVelocitySample = null;
    let bestKeySample = null;

    for (const sample of entry.samples) {
        const keyMatch = key >= sample.keyRangeLo && key <= sample.keyRangeHi;
        const velMatch = vel >= sample.velRangeLo && vel <= sample.velRangeHi;
        if (keyMatch && velMatch) {
            return sample;
        }
        if (keyMatch && !bestKeySample) {
            bestKeySample = sample;
        }
    }

    // Prefer a key match over any sample
    if (bestKeySample) return bestKeySample;
    return entry.samples[0] || null;
}

/**
 * Get program entry from parsed SF2 data
 */
export function getProgramEntry(programSamples, program, isDrum = false, bank = 0) {
    const keys = [];
    if (isDrum) {
        keys.push(`drum_${bank}:${program}`);
        keys.push(`drum_${program}`);
    } else {
        keys.push(`${bank}:${program}`);
        keys.push(`${program}`);
    }
    for (const key of keys) {
        if (programSamples.has(key)) return programSamples.get(key);
    }
    return null;
}

export { timecentsToSeconds, centibelsToGain };
export default { parseSF2, decodeSF2Sample, findSample, getProgramEntry };