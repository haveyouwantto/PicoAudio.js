/**
 * TinySoundFont — font & region construction (JavaScript port)
 *
 * Direct port of the hydra -> preset region half of tsf.h:
 *   https://github.com/schellingb/TinySoundFont
 * TinySoundFont is MIT licensed, Copyright (C) 2017-2025 Bernhard Schelling,
 * based on SFZero, Copyright (C) 2012 Steve Folta.
 *
 * The port keeps the upstream structure on purpose (generator meta table,
 * region clear/operator/merging, preset zone × instrument zone expansion) so
 * it stays auditable against the original. Anything that looks odd here is
 * odd in tsf.h as well — e.g. the initial attenuation factor of 0.01 or the
 * +1/-1 sample position fixups.
 */

export const TSF_LOOPMODE_NONE = 0;
export const TSF_LOOPMODE_CONTINUOUS = 1;
export const TSF_LOOPMODE_SUSTAIN = 3;

const _GEN_TYPE_MASK = 0x0f;
const GEN_FLOAT = 0x01;
const GEN_INT = 0x02;
const GEN_UINT_ADD = 0x03;
const GEN_UINT_ADD15 = 0x04;
const GEN_KEYRANGE = 0x05;
const GEN_VELRANGE = 0x06;
const GEN_LOOPMODE = 0x07;
const GEN_GROUP = 0x08;
const GEN_KEYCENTER = 0x09;

const _GEN_LIMIT_MASK = 0xf0;
const GEN_INT_LIMIT12K = 0x10;
const GEN_INT_LIMITFC = 0x20;
const GEN_INT_LIMITQ = 0x30;
const GEN_INT_LIMIT960 = 0x40;
const GEN_INT_LIMIT16K4500 = 0x50;
const GEN_FLOAT_LIMIT12K5K = 0x60;
const GEN_FLOAT_LIMIT12K8K = 0x70;
const GEN_FLOAT_LIMIT1200 = 0x80;
const GEN_FLOAT_LIMITPAN = 0x90;
const GEN_FLOAT_LIMITATTN = 0xa0;
const GEN_FLOAT_MAX1000 = 0xb0;
const GEN_FLOAT_MAX1440 = 0xc0;

const GEN_MAX = 59;

/**
 * genMetas from tsf.h. `field` is the region property a generator writes to
 * (generators 0/4, 1/12, 2/45 and 3/50 intentionally share one field, exactly
 * like the offset table in the C source).
 */
const GEN_METAS = [
    { mode: GEN_UINT_ADD, field: 'offset' },                          // 0 StartAddrsOffset
    { mode: GEN_UINT_ADD, field: 'end' },                             // 1 EndAddrsOffset
    { mode: GEN_UINT_ADD, field: 'loopStart' },                       // 2 StartloopAddrsOffset
    { mode: GEN_UINT_ADD, field: 'loopEnd' },                         // 3 EndloopAddrsOffset
    { mode: GEN_UINT_ADD15, field: 'offset' },                        // 4 StartAddrsCoarseOffset
    { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'modLfoToPitch' },     // 5
    { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'vibLfoToPitch' },     // 6
    { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'modEnvToPitch' },     // 7
    { mode: GEN_INT | GEN_INT_LIMITFC, field: 'initialFilterFc' },    // 8
    { mode: GEN_INT | GEN_INT_LIMITQ, field: 'initialFilterQ' },      // 9
    { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'modLfoToFilterFc' },  //10
    { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'modEnvToFilterFc' },  //11
    { mode: GEN_UINT_ADD15, field: 'end' },                           //12 EndAddrsCoarseOffset
    { mode: GEN_INT | GEN_INT_LIMIT960, field: 'modLfoToVolume' },    //13
    { mode: 0 },                                                      //14 unused
    { mode: 0 },                                                      //15 chorus (unsupported)
    { mode: 0 },                                                      //16 reverb (unsupported)
    { mode: GEN_FLOAT | GEN_FLOAT_LIMITPAN, field: 'pan' },           //17
    { mode: 0 }, { mode: 0 }, { mode: 0 },                            //18-20
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'delayModLFO' },  //21
    { mode: GEN_INT | GEN_INT_LIMIT16K4500, field: 'freqModLFO' },     //22
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'delayVibLFO' },  //23
    { mode: GEN_INT | GEN_INT_LIMIT16K4500, field: 'freqVibLFO' },     //24
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'modEnv.delay' },   //25
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'modEnv.attack' },  //26
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'modEnv.hold' },    //27
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'modEnv.decay' },   //28
    { mode: GEN_FLOAT | GEN_FLOAT_MAX1000, field: 'modEnv.sustain' },    //29
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'modEnv.release' }, //30
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: 'modEnv.keynumToHold' },  //31
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: 'modEnv.keynumToDecay' }, //32
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'ampEnv.delay' },   //33
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'ampEnv.attack' },  //34
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'ampEnv.hold' },    //35
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'ampEnv.decay' },   //36
    { mode: GEN_FLOAT | GEN_FLOAT_MAX1440, field: 'ampEnv.sustain' },    //37
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'ampEnv.release' }, //38
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: 'ampEnv.keynumToHold' },  //39
    { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: 'ampEnv.keynumToDecay' }, //40
    { mode: 0 },                                                      //41 instrument (special)
    { mode: 0 },                                                      //42 reserved
    { mode: GEN_KEYRANGE },                                           //43
    { mode: GEN_VELRANGE },                                           //44
    { mode: GEN_UINT_ADD15, field: 'loopStart' },                     //45 StartloopAddrsCoarseOffset
    { mode: 0 },                                                      //46 keynum (special)
    { mode: 0 },                                                      //47 velocity (special)
    { mode: GEN_FLOAT | GEN_FLOAT_LIMITATTN, field: 'attenuation' },  //48
    { mode: 0 },                                                      //49 reserved
    { mode: GEN_UINT_ADD15, field: 'loopEnd' },                       //50 EndloopAddrsCoarseOffset
    { mode: GEN_INT, field: 'transpose' },                            //51
    { mode: GEN_INT, field: 'tune' },                                 //52
    { mode: 0 },                                                      //53 sampleID (special)
    { mode: GEN_LOOPMODE },                                           //54
    { mode: 0 },                                                      //55 reserved
    { mode: GEN_INT, field: 'pitchKeytrack' },                        //56
    { mode: GEN_GROUP },                                              //57
    { mode: GEN_KEYCENTER },                                          //58
];

export const tsfTimecents2Secs = (timecents) => Math.pow(2.0, timecents / 1200.0);
export const tsfCents2Hertz = (cents) => 8.176 * Math.pow(2.0, cents / 1200.0);
export const tsfDecibelsToGain = (db) => (db > -100.0 ? Math.pow(10.0, db * 0.05) : 0);
export const tsfGainToDecibels = (gain) => (gain <= 0.00001 ? -100.0 : 20.0 * Math.log10(gain));

const newEnvelope = () => ({
    delay: 0, attack: 0, hold: 0, decay: 0, sustain: 0, release: 0,
    keynumToHold: 0, keynumToDecay: 0,
});

export function regionClear(region, forRelative) {
    region.loopMode = 0;
    region.sampleRate = 0;
    region.lokey = 0; region.hikey = 127;
    region.lovel = 0; region.hivel = 127;
    region.group = 0;
    region.offset = 0; region.end = 0;
    region.loopStart = 0; region.loopEnd = 0;
    region.transpose = 0; region.tune = 0;
    region.pitchKeycenter = 60; // C4
    region.pitchKeytrack = 0;
    region.attenuation = 0;
    region.pan = 0;
    region.ampEnv = newEnvelope();
    region.modEnv = newEnvelope();
    region.initialFilterQ = 0;
    region.initialFilterFc = 0;
    region.modEnvToPitch = 0;
    region.modEnvToFilterFc = 0;
    region.modLfoToFilterFc = 0;
    region.modLfoToVolume = 0;
    region.delayModLFO = 0;
    region.freqModLFO = 0;
    region.modLfoToPitch = 0;
    region.delayVibLFO = 0;
    region.freqVibLFO = 0;
    region.vibLfoToPitch = 0;

    region.hikey = region.hivel = 127;
    region.pitchKeycenter = 60;
    if (forRelative) return;

    region.pitchKeytrack = 100;
    region.pitchKeycenter = -1;

    // SF2 defaults in timecents.
    region.ampEnv.delay = region.ampEnv.attack = region.ampEnv.hold = -12000.0;
    region.ampEnv.decay = region.ampEnv.release = -12000.0;
    region.modEnv.delay = region.modEnv.attack = region.modEnv.hold = -12000.0;
    region.modEnv.decay = region.modEnv.release = -12000.0;

    region.initialFilterFc = 13500;

    region.delayModLFO = -12000.0;
    region.delayVibLFO = -12000.0;
}

const getField = (region, field) => {
    const dot = field.indexOf('.');
    return dot < 0 ? region[field] : region[field.slice(0, dot)][field.slice(dot + 1)];
};

const setField = (region, field, value) => {
    const dot = field.indexOf('.');
    if (dot < 0) region[field] = value;
    else region[field.slice(0, dot)][field.slice(dot + 1)] = value;
};

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/**
 * tsf_region_operator: with `amount` set this applies a single generator,
 * without it the region adds `mergeRegion` generator by generator (the preset
 * zone / instrument zone merge).
 */
export function regionOperator(region, genOper, amount, mergeRegion) {
    const shortAmount = (v) => (v > 32767 ? v - 65536 : v);

    if (amount) {
        if (genOper < 0 || genOper >= GEN_MAX) return;
        const meta = GEN_METAS[genOper];
        switch (meta.mode & _GEN_TYPE_MASK) {
        case GEN_KEYRANGE: region.lokey = amount.range.lo; region.hikey = amount.range.hi; return;
        case GEN_VELRANGE: region.lovel = amount.range.lo; region.hivel = amount.range.hi; return;
        case GEN_FLOAT:
        case GEN_INT: setField(region, meta.field, shortAmount(amount.shortAmount)); return;
        case GEN_UINT_ADD: setField(region, meta.field, getField(region, meta.field) + shortAmount(amount.shortAmount)); return;
        case GEN_UINT_ADD15: setField(region, meta.field, getField(region, meta.field) + (shortAmount(amount.shortAmount) * 32768)); return;
        case GEN_LOOPMODE:
            region.loopMode = (amount.wordAmount & 3) === 3 ? TSF_LOOPMODE_SUSTAIN
                : ((amount.wordAmount & 3) === 1 ? TSF_LOOPMODE_CONTINUOUS : TSF_LOOPMODE_NONE);
            return;
        case GEN_GROUP: region.group = amount.wordAmount; return;
        case GEN_KEYCENTER: region.pitchKeycenter = shortAmount(amount.shortAmount); return;
        default: return;
        }
    }

    // Merge regions and clamp values.
    for (let gen = 0; gen !== GEN_MAX; gen++) {
        const meta = GEN_METAS[gen];
        const type = meta.mode & _GEN_TYPE_MASK;
        if (type === GEN_FLOAT) {
            let val = getField(region, meta.field) + getField(mergeRegion, meta.field);
            let factor, vmin, vmax;
            switch (meta.mode & _GEN_LIMIT_MASK) {
            case GEN_FLOAT_LIMIT12K5K: factor = 1.0; vmin = -12000.0; vmax = 5000.0; break;
            case GEN_FLOAT_LIMIT12K8K: factor = 1.0; vmin = -12000.0; vmax = 8000.0; break;
            case GEN_FLOAT_LIMIT1200: factor = 1.0; vmin = -1200.0; vmax = 1200.0; break;
            case GEN_FLOAT_LIMITPAN: factor = 0.001; vmin = -0.5; vmax = 0.5; break;
            case GEN_FLOAT_LIMITATTN: factor = 0.01; vmin = 0.0; vmax = 14.4; break;
            case GEN_FLOAT_MAX1000: factor = 1.0; vmin = 0.0; vmax = 1000.0; break;
            case GEN_FLOAT_MAX1440: factor = 1.0; vmin = 0.0; vmax = 1440.0; break;
            default: continue;
            }
            val *= factor;
            setField(region, meta.field, clamp(val, vmin, vmax));
            continue;
        }
        if (type === GEN_INT) {
            let val = getField(region, meta.field) + getField(mergeRegion, meta.field);
            let vmin, vmax;
            switch (meta.mode & _GEN_LIMIT_MASK) {
            case GEN_INT_LIMIT12K: vmin = -12000; vmax = 12000; break;
            case GEN_INT_LIMITFC: vmin = 1500; vmax = 13500; break;
            case GEN_INT_LIMITQ: vmin = 0; vmax = 960; break;
            case GEN_INT_LIMIT960: vmin = -960; vmax = 960; break;
            case GEN_INT_LIMIT16K4500: vmin = -16000; vmax = 4500; break;
            default: continue;
            }
            setField(region, meta.field, clamp(val, vmin, vmax));
            continue;
        }
        if (type === GEN_UINT_ADD) {
            setField(region, meta.field, getField(region, meta.field) + getField(mergeRegion, meta.field));
        }
    }
}

/** tsf_region_envtosecs */
export function regionEnvToSecs(p, sustainIsGain) {
    p.delay = (p.delay < -11950.0 ? 0.0 : tsfTimecents2Secs(p.delay));
    p.attack = (p.attack < -11950.0 ? 0.0 : tsfTimecents2Secs(p.attack));
    p.release = (p.release < -11950.0 ? 0.0 : tsfTimecents2Secs(p.release));

    // Dynamic hold/decay times stay in timecents until the note is started.
    if (!p.keynumToHold) p.hold = (p.hold < -11950.0 ? 0.0 : tsfTimecents2Secs(p.hold));
    if (!p.keynumToDecay) p.decay = (p.decay < -11950.0 ? 0.0 : tsfTimecents2Secs(p.decay));

    if (p.sustain < 0.0) p.sustain = 0.0;
    else if (sustainIsGain) p.sustain = tsfDecibelsToGain(-p.sustain / 10.0);
    else p.sustain = 1.0 - (p.sustain / 1000.0);
}

/**
 * tsf_load_presets: expand phdr/pbag/pgen + inst/ibag/igen into flat preset
 * regions (one region per sample zone that survives the preset zone ranges).
 *
 * @param {Object} hydra parsed header lists (phdrs, pbags, pgens, insts, ibags, igens, shdrs)
 * @param {number} fontSampleCount number of 16 bit frames in the smpl chunk
 * @returns {Array<{name, bank, preset, regions}>}
 */
export function buildPresetRegions(hydra, fontSampleCount) {
    const { phdrs, pbags, pgens, insts, ibags, igens, shdrs } = hydra;
    const presetNum = phdrs.length - 1;
    const presets = new Array(presetNum);

    for (let ph = 0; ph < presetNum; ph++) {
        const pphdr = phdrs[ph];
        const pphdrNext = phdrs[ph + 1];

        let sortedIndex = 0;
        for (let o = 0; o < presetNum; o++) {
            const other = phdrs[o];
            if (o === ph || other.bank > pphdr.bank) continue;
            else if (other.bank < pphdr.bank) sortedIndex++;
            else if (other.presetNum > pphdr.presetNum) continue;
            else if (other.presetNum < pphdr.presetNum) sortedIndex++;
            else if (o < ph) sortedIndex++;
        }

        const preset = {
            name: pphdr.name,
            bank: pphdr.bank,
            preset: pphdr.presetNum,
            regions: [],
        };
        const regions = preset.regions;
        const globalRegion = {};
        regionClear(globalRegion, 1);

        // Zones.
        for (let pb = pphdr.presetBagNdx; pb < pphdrNext.presetBagNdx; pb++) {
            const presetRegion = { ...globalRegion, ampEnv: { ...globalRegion.ampEnv }, modEnv: { ...globalRegion.modEnv } };
            let hadGenInstrument = false;

            for (let pg = pbags[pb].genIndex; pg < pbags[pb + 1].genIndex; pg++) {
                const ppgen = pgens[pg];

                if (ppgen.type === 41) { // GenInstrument
                    const whichInst = ppgen.amount.wordAmount;
                    if (whichInst >= insts.length) continue;

                    const instRegion = {};
                    regionClear(instRegion, 0);
                    for (let ib = insts[whichInst].bagIndex; ib < insts[whichInst + 1].bagIndex; ib++) {
                        const zoneRegion = {
                            ...instRegion,
                            ampEnv: { ...instRegion.ampEnv },
                            modEnv: { ...instRegion.modEnv },
                        };
                        let hadSampleId = false;

                        for (let ig = ibags[ib].genIndex; ig < ibags[ib + 1].genIndex; ig++) {
                            const pigen = igens[ig];
                            if (pigen.type === 53) { // GenSampleID
                                // Preset region key/vel ranges filter the zone regions.
                                if (zoneRegion.hikey < presetRegion.lokey || zoneRegion.lokey > presetRegion.hikey) continue;
                                if (zoneRegion.hivel < presetRegion.lovel || zoneRegion.lovel > presetRegion.hivel) continue;
                                if (presetRegion.lokey > zoneRegion.lokey) zoneRegion.lokey = presetRegion.lokey;
                                if (presetRegion.hikey < zoneRegion.hikey) zoneRegion.hikey = presetRegion.hikey;
                                if (presetRegion.lovel > zoneRegion.lovel) zoneRegion.lovel = presetRegion.lovel;
                                if (presetRegion.hivel < zoneRegion.hivel) zoneRegion.hivel = presetRegion.hivel;

                                // Sum regions.
                                regionOperator(zoneRegion, 0, null, presetRegion);

                                regionEnvToSecs(zoneRegion.ampEnv, 1);
                                regionEnvToSecs(zoneRegion.modEnv, 0);

                                zoneRegion.delayModLFO = (zoneRegion.delayModLFO < -11950.0 ? 0.0 : tsfTimecents2Secs(zoneRegion.delayModLFO));
                                zoneRegion.delayVibLFO = (zoneRegion.delayVibLFO < -11950.0 ? 0.0 : tsfTimecents2Secs(zoneRegion.delayVibLFO));

                                // Fixup sample positions.
                                const pshdr = shdrs[pigen.amount.wordAmount];
                                zoneRegion.offset += pshdr.start;
                                zoneRegion.end += pshdr.end;
                                zoneRegion.loopStart += pshdr.startLoop;
                                zoneRegion.loopEnd += pshdr.endLoop;
                                if (pshdr.endLoop > 0) zoneRegion.loopEnd -= 1;
                                if (zoneRegion.loopEnd > fontSampleCount) zoneRegion.loopEnd = fontSampleCount;
                                if (zoneRegion.pitchKeycenter === -1) zoneRegion.pitchKeycenter = pshdr.originalKey;
                                zoneRegion.tune += pshdr.correction;
                                zoneRegion.sampleRate = pshdr.sampleRate;
                                if (zoneRegion.end && zoneRegion.end < fontSampleCount) zoneRegion.end++;
                                else zoneRegion.end = fontSampleCount;

                                // Not part of tsf.h: the header index, kept so
                                // diagnostics can name the sample a region uses.
                                zoneRegion.sampleId = pigen.amount.wordAmount;
                                regions.push(zoneRegion);
                                hadSampleId = true;
                            } else {
                                regionOperator(zoneRegion, pigen.type, pigen.amount, null);
                            }
                        }

                        // Handle instrument's global zone.
                        if (ib === insts[whichInst].bagIndex && !hadSampleId) {
                            Object.assign(instRegion, zoneRegion);
                            instRegion.ampEnv = { ...zoneRegion.ampEnv };
                            instRegion.modEnv = { ...zoneRegion.modEnv };
                        }
                    }
                    hadGenInstrument = true;
                } else {
                    regionOperator(presetRegion, ppgen.type, ppgen.amount, null);
                }
            }

            // Handle preset's global zone.
            if (pb === pphdr.presetBagNdx && !hadGenInstrument) {
                Object.assign(globalRegion, presetRegion);
                globalRegion.ampEnv = { ...presetRegion.ampEnv };
                globalRegion.modEnv = { ...presetRegion.modEnv };
            }
        }

        presets[sortedIndex] = preset;
    }

    return presets;
}

export default { buildPresetRegions, regionClear, regionOperator, regionEnvToSecs };
