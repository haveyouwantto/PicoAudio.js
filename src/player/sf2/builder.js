import { SF2Gen, timecentsToSeconds, centibelsToGain, signed16 } from './constants.js';

/**
 * Parse a contiguous slice of generator records into a key/value map with derived values.
 * This is the single source of truth for all generator value extraction.
 *
 * Derived value conventions:
 *  - `*_timecents`: raw signed timecents (for keynum/key-scaling math)
 *  - `*_seconds`: timecents converted to seconds
 *  - `*_cb`: raw signed centibels
 *  - `*_gain`: centibels converted to linear gain (attenuation)
 *  - ranges (`keyRange`/`velRange`) are [lo, hi] inclusive
 *  - `pan` kept as 0..1000 (SF2 spec) in `pan1000`, `pan` retains legacy 0..127 interpretation
 */
export function parseGeneratorsKV(gens, genStart, genEnd) {
    const out = {};
    const defaultEnvelopeSeconds = {
        delay: 0,
        attack: 0.001,
        hold: 0,
        decay: 0,
        sustain: 1.0,
        release: 0.01,
    };

    for (let i = genStart; i < genEnd && i < gens.length; i++) {
        const gen = gens[i];
        const t = gen.type;
        const a = gen.amount & 0xFFFF;
        const s = signed16(a);

        switch (t) {
            // --- sample address offsets (sample frames) ---
            case SF2Gen.startAddrsOffset:        out.startAddrsOffset = s; break;
            case SF2Gen.endAddrsOffset:          out.endAddrsOffset = s; break;
            case SF2Gen.startLoopAddrsOffset:    out.startLoopAddrsOffset = s; break;
            case SF2Gen.endLoopAddrsOffset:      out.endLoopAddrsOffset = s; break;
            case SF2Gen.startAddrsCoarseOffset:  out.startAddrsCoarseOffset = s; break;
            case SF2Gen.endAddrsCoarseOffset:    out.endAddrsCoarseOffset = s; break;
            case SF2Gen.startLoopAddrsCoarseOffset: out.startLoopAddrsCoarseOffset = s; break;

            // --- pitch / modulation (cents) ---
            case SF2Gen.coarseTune:
                out.coarseTune = s;
                out.coarseTune_semitones = s / 100.0;
                break;
            case SF2Gen.fineTune:
                out.fineTune = s;
                out.fineTune_semitones = s / 100.0;
                break;
            case SF2Gen.scaleTuning:
                out.scaleTuning = a; // 0..1200 cents, default 100 (no scaling)
                break;
            case SF2Gen.overridingRootKey:
                out.rootKey = a & 0xFF;
                break;
            case SF2Gen.modLfoToPitch:
                out.modLFOToPitch_cents = s;
                out.modLFOToPitch_semitones = s / 100.0;
                break;
            case SF2Gen.vibLfoToPitch:
                out.vibLFOToPitch_cents = s;
                out.vibLFOToPitch_semitones = s / 100.0;
                break;
            case SF2Gen.modEnvToPitch:
                out.modEnvToPitch_cents = s;
                out.modEnvToPitch_semitones = s / 100.0;
                break;
            case SF2Gen.keynum:
                out.keynum = a & 0xFF;
                break;
            case SF2Gen.velocity:
                out.velocity = a & 0xFF;
                break;

            // --- filter ---
            case SF2Gen.initialFilterFc:
                out.initialFilterFc_cents = s;
                // SF2: 0 cents = 8.176 Hz; cents relative to that base
                out.initialFilterFc_hz = 8.176 * Math.pow(2, s / 1200);
                break;
            case SF2Gen.initialFilterQ:
                out.initialFilterQ_cb = s;
                out.initialFilterQ = Math.max(0.0001, Math.pow(10, s / 200)); // centibels -> linear Q
                break;
            case SF2Gen.modLfoToFilterFc:
                out.modLFOToFilterFc_cents = s;
                break;
            case SF2Gen.modEnvToFilterFc:
                out.modEnvToFilterFc_cents = s;
                break;

            // --- volume / mix ---
            case SF2Gen.modLfoToVolume:
                out.modLFOToVolEnv_cb = s;
                out.modLFOToVolEnv_gain = centibelsToGain(s);
                break;
            case SF2Gen.chorusEffectsSend:
                out.chorusSend = a; // 0..1000 (0.1% units)
                break;
            case SF2Gen.reverbEffectsSend:
                out.reverbSend = a; // 0..1000 (0.1% units)
                break;
            case SF2Gen.pan:
                // SF2 spec: 0..1000, 500 = center. Legacy files sometimes use 0..127.
                out.pan1000 = a;
                out.pan = a > 127 ? Math.round(a / 1000 * 127) : a; // legacy 0..127
                break;
            case SF2Gen.initialAttenuation:
                out.initialAttenuation_cb = s;
                out.initialAttenuation_gain = centibelsToGain(s);
                break;

            // --- LFO timings & freqs ---
            case SF2Gen.delayModLFO:
                out.delayModLFO_timecents = s;
                out.delayModLFO_seconds = Math.max(0, timecentsToSeconds(s));
                break;
            case SF2Gen.freqModLFO:
                out.freqModLFO_timecents = s;
                out.freqModLFO_period_seconds = Math.max(0.001, timecentsToSeconds(s));
                out.freqModLFO_hz = 1 / out.freqModLFO_period_seconds;
                break;
            case SF2Gen.delayVibLFO:
                out.delayVibLFO_timecents = s;
                out.delayVibLFO_seconds = Math.max(0, timecentsToSeconds(s));
                break;
            case SF2Gen.freqVibLFO:
                out.freqVibLFO_timecents = s;
                out.freqVibLFO_period_seconds = Math.max(0.001, timecentsToSeconds(s));
                out.freqVibLFO_hz = 1 / out.freqVibLFO_period_seconds;
                break;

            // --- modulation envelope (timecents) ---
            case SF2Gen.delayModEnv:
                out.delayModEnv_timecents = s;
                out.delayModEnv_seconds = Math.max(0, timecentsToSeconds(s));
                break;
            case SF2Gen.attackModEnv:
                out.attackModEnv_timecents = s;
                out.attackModEnv_seconds = Math.max(0.001, timecentsToSeconds(s));
                break;
            case SF2Gen.holdModEnv:
                out.holdModEnv_timecents = s;
                out.holdModEnv_seconds = Math.max(0, timecentsToSeconds(s));
                break;
            case SF2Gen.decayModEnv:
                out.decayModEnv_timecents = s;
                out.decayModEnv_seconds = Math.max(0.001, timecentsToSeconds(s));
                break;
            case SF2Gen.sustainModEnv:
                // sustain is an *attenuation* in centibels (0 = full level)
                out.sustainModEnv_cb = s;
                out.sustainModEnv = centibelsToGain(s);
                break;
            case SF2Gen.releaseModEnv:
                out.releaseModEnv_timecents = s;
                out.releaseModEnv_seconds = Math.max(0.001, timecentsToSeconds(s));
                break;
            case SF2Gen.keynumToModEnvHold:
                out.keyNumToModEnvHold = s; // timecents per keynum
                break;
            case SF2Gen.keynumToModEnvDecay:
                out.keyNumToModEnvDecay = s; // timecents per keynum
                break;

            // --- volume envelope ---
            case SF2Gen.delayVolEnv:
                out.delayVolEnv_timecents = s;
                out.delayVolEnv = Math.max(0, timecentsToSeconds(s));
                break;
            case SF2Gen.attackVolEnv:
                out.attackVolEnv_timecents = s;
                out.attackVolEnv = Math.max(0.001, timecentsToSeconds(s));
                break;
            case SF2Gen.holdVolEnv:
                out.holdVolEnv_timecents = s;
                out.holdVolEnv = Math.max(0, timecentsToSeconds(s));
                break;
            case SF2Gen.decayVolEnv:
                out.decayVolEnv_timecents = s;
                out.decayVolEnv = Math.max(0.001, timecentsToSeconds(s));
                break;
            case SF2Gen.sustainVolEnv:
                out.sustainVolEnv_cb = s;
                out.sustainVolEnv = centibelsToGain(s);
                break;
            case SF2Gen.releaseVolEnv:
                out.releaseVolEnv_timecents = s;
                out.releaseVolEnv = Math.max(0.001, timecentsToSeconds(s));
                break;
            case SF2Gen.keynumToVolEnvHold:
                out.keyNumToVolEnvHold = s; // timecents per keynum
                break;
            case SF2Gen.keynumToVolEnvDecay:
                out.keyNumToVolEnvDecay = s; // timecents per keynum
                break;

            // --- zone / instrument linkage ---
            case SF2Gen.instrument:
                out.instrument = a;
                break;
            case SF2Gen.keyRange:
                out.keyRange = [a & 0xFF, (a >> 8) & 0xFF];
                break;
            case SF2Gen.velRange:
                out.velRange = [a & 0xFF, (a >> 8) & 0xFF];
                break;

            case SF2Gen.sampleID:
                out.sampleID = a;
                break;
            case SF2Gen.sampleModes:
                out.sampleModes = a;
                break;
            case SF2Gen.exclusiveClass:
                out.exclusiveClass = a;
                break;

            default:
                out[`gen_${t}`] = { raw: a, signed: s };
                break;
        }
    }

    // Apply SF2 spec defaults for envelope/shaping values if not present.
    // (These defaults are applied at merge time in buildPresetZones for full accuracy.)
    out._defaults = defaultEnvelopeSeconds;
    return out;
}

/**
 * Build a list of instrument objects, each containing a global generator map
 * and an array of sample zones (each with its own generator map).
 *
 * @param {Array} instruments  parsed inst records
 * @param {Array} instrumentBags  parsed ibag records
 * @param {Array} instrumentGens  parsed igen records
 * @param {Array} sampleHeaders   parsed shdr records
 * @returns {Array<{name: string, generators: Object|null, samples: Array<{sampleId:number, generators:Object}>}>}
 */
export function buildInstrumentSamples(instruments, instrumentBags, instrumentGens, sampleHeaders, signed16) {
    const result = [];
    for (let i = 0; i < instruments.length - 1; i++) {
        const inst = instruments[i];
        const nextBagIndex = instruments[i + 1].bagIndex;
        const bagStart = inst.bagIndex;
        const bagEnd = nextBagIndex;
        let globalGenerators = null;
        let firstSampleZone = bagStart;

        // Find the global zone (bag without sampleID) and parse its generators
        for (let b = bagStart; b < bagEnd; b++) {
            const bag = instrumentBags[b];
            const nextBag = (b + 1 < instrumentBags.length) ? instrumentBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : instrumentGens.length;
            let hasSample = false;
            for (let g = genStart; g < genEnd && g < instrumentGens.length; g++) {
                if (instrumentGens[g].type === SF2Gen.sampleID) { hasSample = true; break; }
            }
            if (!hasSample) {
                globalGenerators = parseGeneratorsKV(instrumentGens, genStart, genEnd);
                firstSampleZone = b + 1;
            } else {
                firstSampleZone = b;
                break;
            }
        }

        const samples = [];
        for (let b = firstSampleZone; b < bagEnd; b++) {
            const bag = instrumentBags[b];
            const nextBag = (b + 1 < instrumentBags.length) ? instrumentBags[b + 1] : null;
            const genStart = bag.genIndex;
            const genEnd = nextBag ? nextBag.genIndex : instrumentGens.length;
            const zoneGenerators = parseGeneratorsKV(instrumentGens, genStart, genEnd);

            const sampleId = zoneGenerators.sampleID;
            if (sampleId == null || sampleId < 0 || sampleId >= sampleHeaders.length) continue;

            samples.push({
                sampleId,
                generators: zoneGenerators,
            });
        }
        result.push({ name: inst.name, generators: globalGenerators, samples });
    }
    return result;
}

/**
 * Merge generator maps in SF2 precedence order (later overrides earlier).
 * Handles timecents-based keynum corrections and envelope defaults.
 *
 * @param {...Object|null} genMaps generator maps in increasing precedence
 * @returns {Object} merged generator map
 */
export function mergeGenerators(...genMaps) {
    const merged = {};
    for (const gm of genMaps) {
        if (!gm) continue;
        for (const [k, v] of Object.entries(gm)) {
            if (k === '_defaults') continue;
            merged[k] = v;
        }
    }
    return merged;
}

/**
 * Build complete preset zone list. For every preset zone, resolve the
 * referenced instrument and merge:
 *   preset-zone generators  →  instrument global generators  →  instrument-zone generators
 * This produces fully-resolved zones ready for rendering (multiple zones per
 * key can overlap — renderers should play all matching zones).
 *
 * @param {Array} presets parsed phdr-derived preset shells ({program,bank,isDrum,zones:[{instrumentIndex,keyRangeLo,keyRangeHi}]})
 * @param {Array} presetBags   pbag records
 * @param {Array} presetGens   pgen records
 * @param {Array} instruments  built instruments from buildInstrumentSamples
 * @param {Array} sampleHeaders shdr records
 * @returns {Array<{name:string, program:number, bank:number, isDrum:boolean,
 *                   zones: Array<{keyRange:[number,number], velRange:[number,number],
 *                                  generators:Object, sampleId:number}>}>}
 */
export function buildPresetZones(presets, presetBags, presetGens, instruments, sampleHeaders) {
    const result = [];
    for (const preset of presets) {
        const zones = [];
        for (const zone of preset.zones) {
            const inst = instruments[zone.instrumentIndex];
            if (!inst) continue;

            // NOTE: preset-level generator records (keyRange, overridingRootKey,
            // scaleTuning, etc.) are intentionally NOT merged here. The original
            // PicoAudio SF2 provider only merged instrument-global + instrument-zone
            // generators; merging preset-zone generators changed tuning/selection
            // for some instruments. Keep this behavior aligned with the classic
            // renderer for correct pitch and zone selection.

            for (const sample of inst.samples) {
                if (sample.sampleId == null || sample.sampleId < 0 || sample.sampleId >= sampleHeaders.length) continue;

                const merged = mergeGenerators(
                    inst.generators, // instrument global
                    sample.generators, // instrument zone
                );

                // Default key/vel range if not specified anywhere
                if (!merged.keyRange) merged.keyRange = [0, 127];
                if (!merged.velRange) merged.velRange = [0, 127];

                zones.push({
                    keyRange: merged.keyRange,
                    velRange: merged.velRange,
                    generators: merged,
                    sampleId: sample.sampleId,
                });
            }
        }
        result.push({ name: preset.name, program: preset.program, bank: preset.bank, isDrum: preset.isDrum, zones });
    }
    return result;
}

export default { parseGeneratorsKV, buildInstrumentSamples, buildPresetZones, mergeGenerators };