import defaultWave from "./default-wave";
import { miniIFFT } from "../audio/dsp";

// Wavetable size: power-of-2 for IFFT, 2048 samples = one cycle
const WAVETABLE_SIZE = 2048;

const quickfadeArray = [
    // Piano
    true,   // 0: Acoustic Grand Piano
    true,   // 1: Bright Acoustic Piano
    true,   // 2: Electric Grand Piano
    true,   // 3: Honky-tonk Piano
    true,   // 4: Electric Piano 1
    true,   // 5: Electric Piano 2
    true,   // 6: Harpsichord
    true,   // 7: Clavinet
    // Chromatic Percussion
    true,   // 8: Celesta
    true,   // 9: Glockenspiel
    true,   // 10: Music Box
    true,   // 11: Vibraphone
    true,   // 12: Marimba
    true,   // 13: Xylophone
    true,   // 14: Tubular Bells
    true,   // 15: Dulcimer
    // Organ
    false,   // 16: Drawbar Organ
    false,   // 17: Percussive Organ
    false,   // 18: Rock Organ
    false,   // 19: Church Organ
    false,   // 20: Reed Organ
    false,   // 21: Accordion
    false,   // 22: Harmonica
    false,   // 23: Tango Accordion
    // Guitar
    true,   // 24: Acoustic Guitar (nylon)
    true,   // 25: Acoustic Guitar (steel)
    true,   // 26: Electric Guitar (jazz)
    true,   // 27: Electric Guitar (clean)
    true,   // 28: Electric Guitar (muted)
    false,   // 29: Overdriven Guitar
    false,   // 30: Distortion Guitar
    false,   // 31: Guitar harmonics
    // Bass
    true,   // 32: Acoustic Bass
    true,   // 33: Electric Bass (finger)
    true,   // 34: Electric Bass (pick)
    true,   // 35: Fretless Bass
    true,   // 36: Slap Bass 1
    true,   // 37: Slap Bass 2
    true,   // 38: Synth Bass 1
    false,   // 39: Synth Bass 2
    // Strings
    false,  // 40: Violin
    false,  // 41: Viola
    false,  // 42: Cello
    false,  // 43: Contrabass
    false,  // 44: Tremolo Strings
    true,  // 45: Pizzicato Strings
    true,  // 46: Orchestral Harp
    true,  // 47: Timpani
    // Ensemble
    false,  // 48: String Ensemble 1
    false,  // 49: String Ensemble 2
    false,  // 50: SynthStrings 1
    false,  // 51: SynthStrings 2
    false,  // 52: Choir Aahs
    false,  // 53: Voice Oohs
    false,  // 54: Synth Choir
    true,  // 55: Orchestra Hit
    // Brass
    false,  // 56: Trumpet
    false,  // 57: Trombone
    false,  // 58: Tuba
    false,  // 59: Muted Trumpet
    false,  // 60: French Horn
    false,  // 61: Brass Section
    false,  // 62: SynthBrass 1
    false,  // 63: SynthBrass 2
    // Reed
    false,  // 64: Soprano Sax
    false,  // 65: Alto Sax
    false,  // 66: Tenor Sax
    false,  // 67: Baritone Sax
    false,  // 68: Oboe
    false,  // 69: English Horn
    false,  // 70: Bassoon
    false,  // 71: Clarinet
    // Pipe
    false,  // 72: Piccolo
    false,  // 73: Flute
    false,  // 74: Recorder
    false,  // 75: Pan Flute
    false,  // 76: Blown Bottle
    false,  // 77: Shakuhachi
    false,  // 78: Whistle
    false,  // 79: Ocarina
    // Synth Lead
    false,   // 80: Lead 1 (square)
    false,   // 81: Lead 2 (sawtooth)
    false,   // 82: Lead 3 (calliope)
    false,   // 83: Lead 4 (chiff)
    false,   // 84: Lead 5 (charang)
    false,   // 85: Lead 6 (voice)
    false,   // 86: Lead 7 (fifths)
    false,   // 87: Lead 8 (bass + lead)
    // Synth Pad
    false,  // 88: Pad 1 (new age)
    false,  // 89: Pad 2 (warm)
    false,  // 90: Pad 3 (polysynth)
    false,  // 91: Pad 4 (choir)
    false,  // 92: Pad 5 (bowed)
    false,  // 93: Pad 6 (metallic)
    false,  // 94: Pad 7 (halo)
    false,  // 95: Pad 8 (sweep)
    // Synth Effects
    true,   // 96: FX 1 (rain)
    false,   // 97: FX 2 (soundtrack)
    true,   // 98: FX 3 (crystal)
    true,   // 99: FX 4 (atmosphere)
    true,   // 100: FX 5 (brightness)
    false,   // 101: FX 6 (goblins)
    false,   // 102: FX 7 (echoes)
    false,   // 103: FX 8 (sci-fi)
    // Ethnic
    true,  // 104: Sitar
    true,  // 105: Banjo
    true,  // 106: Shamisen
    true,  // 107: Koto
    true,  // 108: Kalimba
    false,  // 109: Bagpipe
    false,  // 110: Fiddle
    false,  // 111:Shanai
    // Percussive
    true,   // 112: Tinkle Bell
    true,   // 113: Agogo
    true,   // 114: Steel Drums
    true,   // 115: Woodblock
    true,   // 116: Taiko Drum
    true,   // 117: Melodic Tom
    true,   // 118: Synth Drum
    true,   // 119: Reverse Cymbal
    // Sound effects
    true,   // 120: Guitar Fret Noise
    true,   // 121: Breath Noise
    false,   // 122: Seashore
    true,   // 123: Bird Tweet
    true,   // 124: Telephone Ring
    false,   // 125: Helicopter
    false,   // 126: Applause
    true    // 127: Gunshot
];

const volumes = [1.2, 1.1, 1.05, 1.2, 1.3]



function base64ToBuffer(base64String) {
    // Decode the base64 data
    var binaryData = atob(base64String);

    // Create a buffer to hold the binary data
    var buffer = new ArrayBuffer(binaryData.length);
    var view = new Uint8Array(buffer);

    // Copy the binary data into the buffer
    for (var i = 0; i < binaryData.length; i++) {
        view[i] = binaryData.charCodeAt(i);
    }

    return buffer;
}

function dequantize(uint8Arr) {
    return new Float32Array(uint8Arr).map(value => {
        if (value == 0) return 0;
        else if (value == 255) return 1;
        const dbValue = value * (80 / 255) - 80;
        return Math.pow(10, dbValue / 20);
    });
}

function dequantizeTime(v){
    return v / 65535 * 4;
}

function dequantizeVibrato(v){
    return v / 10;
}

function dequantizeVolume(v){
    console.log(v)
    return 1 + (v / 128)
}

function parseInstruments(arrayBuffer) {
    var dataView = new DataView(arrayBuffer);
    var instruments = [];
    var offset = 0;

    for (var octave = 0; octave < 5; octave++) {
        var octaveData = [];
        instruments.push(octaveData);

        for (var program = 0; program < 128; program++) {
            var programData = {};

            const adsr = [0,0,0,0];
            for (let i = 0; i < 4; i++) {
                adsr[i]= dequantizeTime(dataView.getUint16(offset, true))
                offset+=2;
            }


            programData.adsr = adsr;
            programData.vibrato = dequantizeVibrato(dataView.getUint8(offset++))

            var ampLen = dataView.getUint8(offset);
            offset++;

            programData.data = dequantize(new Uint8Array(arrayBuffer.slice(offset, offset + ampLen)));
            offset += ampLen;
            octaveData.push(programData);
        }
    }

    console.log(instruments)
    return instruments;
}

// Variable to store parsed instruments
let instruments = null;

// Function to load waves from a buffer
export function loadWaves(buffer) {
    // If no buffer is provided, load default periodic wave table
    if (!buffer) {
        var b = base64ToBuffer(defaultWave.instrumentData);
        instruments = parseInstruments(b);
    } else {
        try {
            // Parse instruments from the provided buffer
            instruments = parseInstruments(buffer);
        } catch (e) {
            // If an error occurs during parsing, load default waves
            loadWaves();
        }
    }
}

// Load waves initially
loadWaves();

// Generate a random phase value between -π and π
function getRandomPhase() {
    return Math.random() * 2 * Math.PI - Math.PI;
}

// Create a waveform based on the instrument
function createWave(inst) {
    // DC offset, should always be 0
    let real = [0];
    let imag = [0];
    // 为低频音色进行 SBR (Spectral Band Replication) 增强
    // 如果谐波数量较少 (如 64 个)，低频率下高频分量不足导致声音沉闷。
    // 我们复制现有的谐波系数并以三角形衰减的方式贴在后面，手动增加倍频程。
    let extendedData = Array.from(inst.data);
    const originalLen = extendedData.length;

    // 复制一层：计算缩放系数以确保频谱连续性
    // 复制段的第一项能量不能超过原始段的最后一项
    const lastRatio = originalLen > 0 ? extendedData[originalLen - 1] : 0;
    const firstRatio = originalLen > 0 ? extendedData[0] : 1;
    const sbrScale = firstRatio > 0 ? Math.min(1.0, lastRatio / firstRatio) : 0;

    for (let i = 0; i < originalLen; i++) {
        // 基于 sbrScale 比例进行复制，并应用三角形递减 (1 -> 0)
        extendedData.push(inst.data[i] * sbrScale * (1 - i / originalLen));
    }

    // Generate the real and imaginary parts of the waveform
    extendedData.forEach(f => {
        let phase = getRandomPhase();
        real.push(f * Math.cos(phase));
        imag.push(f * Math.sin(phase));
    });
    // Return the waveform as an array of Float32Arrays
    return [new Float32Array(real), new Float32Array(imag)];
}

// Get the waveform for a specific instrument and octave (default octave is 2)
export function getWave(context, instId, octave = 2) {
    let inst = instruments[octave][instId];
    // Check if the waveform for the given instrument and octave is already cached
    if (inst.wave) {
        // If cached, return the cached waveform
        return inst;
    } else {
        // If not cached, create the waveform
        let samples = createWave(inst);
        // Create custom waveform using the context
        var customWaveform = context.createPeriodicWave(samples[0], samples[1]);
        // Cache the custom waveform for future use
        inst.wave = customWaveform;
        // Return the custom waveform
        return inst;
    }
}

function findClosestNumberIndex(target) {
    // Calculate the index based on the fixed sequence properties
    if (target <= 45) {
        return 0;
    } else if (target >= 93) {
        return 4;
    } else {
        return Math.round((target - 45) / 12);
    }
}

// Convert harmonic coefficients (real/imag pairs) to time-domain wavetable via IFFT.
// The output is a single-cycle waveform normalized to [-1, 1].
function harmonicToTimeDomain(real, imag) {
    const harmonicCount = real.length;
    // Build a symmetric spectrum of size WAVETABLE_SIZE for real-valued time-domain output.
    // Spectrum layout: [DC, pos_freqs..., 0, ..., neg_freqs_reversed...]
    // For a real signal, X[N - k] = conj(X[k]).
    const reSpec = new Float32Array(WAVETABLE_SIZE);
    const imSpec = new Float32Array(WAVETABLE_SIZE);

    // DC
    reSpec[0] = real[0];
    imSpec[0] = 0;

    // Positive frequencies (harmonics 1..N-1)
    for (let k = 1; k < harmonicCount && k < WAVETABLE_SIZE / 2; k++) {
        reSpec[k] = real[k];
        imSpec[k] = imag[k];
        // Negative frequencies = conjugate of positive
        reSpec[WAVETABLE_SIZE - k] = real[k];
        imSpec[WAVETABLE_SIZE - k] = -imag[k];
    }

    // Nyquist bin (WAVETABLE_SIZE/2) - set to 0 if no coefficient there
    reSpec[WAVETABLE_SIZE / 2] = 0;
    imSpec[WAVETABLE_SIZE / 2] = 0;

    // IFFT
    miniIFFT(reSpec, imSpec);

    // Normalize to [-1, 1]
    let maxVal = 0;
    for (let i = 0; i < WAVETABLE_SIZE; i++) {
        const abs = Math.abs(reSpec[i]);
        if (abs > maxVal) maxVal = abs;
    }
    if (maxVal > 0) {
        for (let i = 0; i < WAVETABLE_SIZE; i++) {
            reSpec[i] /= maxVal;
        }
    }

    return reSpec;
}

/**
 * Lazily get a wavetable AudioBuffer for a given instrument and octave.
 * On first access, converts harmonic data to time-domain via IFFT and
 * creates a loopable AudioBuffer (one full cycle). Subsequent calls return cached.
 * @param {AudioContext} context 
 * @param {number} instId MIDI program number (0-127)
 * @param {number} octave Octave index (0-4)
 * @returns {Object} instrument data with .wavetable (AudioBuffer) and .adsr
 */
export function getWaveTable(context, instId, octave = 2) {
    let inst = instruments[octave][instId];
    // Already cached?
    if (inst.wavetable) {
        return inst;
    }
    // Generate harmonic coefficients (same as getWave, cached on inst._samples)
    if (!inst._samples) {
        inst._samples = createWave(inst);
    }
    // IFFT to time domain
    const timeDomain = harmonicToTimeDomain(inst._samples[0], inst._samples[1]);
    // Create loopable AudioBuffer
    const buffer = context.createBuffer(1, WAVETABLE_SIZE, context.sampleRate);
    buffer.getChannelData(0).set(timeDomain);
    inst.wavetable = buffer;
    return inst;
}

export function getVolumeMul(note) {
    const val = (note - 45) / 12;
    if (val <= 0) return volumes[0];
    if (val >= volumes.length - 1) return volumes[volumes.length - 1];
    const i = Math.floor(val);
    return volumes[i] + (volumes[i + 1] - volumes[i]) * (val - i);
}

export { quickfadeArray, findClosestNumberIndex, WAVETABLE_SIZE };
