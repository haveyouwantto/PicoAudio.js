import defaultWave from "./default-wave";
import { ksSampler } from "./ks-sampler";

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

const envelope = [[0, 1.16, 0.157, 0.252], [0, 1.58, 0.109, 0.276], [0, 1.56, 0.117, 0.136], [0.0232, 1.49, 0.111, 0.276], [0, 0.766, 0.0805, 0.0666], [0, 1.35, 0.0868, 0.0434], [0, 1.65, 0.134, 0.136], [0, 1.6, 0.129, 0.0434], [0, 1.09, 0.0605, 0.252], [0, 0.813, 0.0542, 0.159], [0, 0.766, 0.0224, 0.5], [0, 1.7, 0.217, 0.252], [0, 0.441, 0.0544, 0.0201], [0, 0.58, 0.0511, 0.0201], [0, 0.882, 0.0786, 0.5], [0, 1.56, 0.0909, 0.415], [0, 0.975, 0.721, 0.0666], [0, 0.0697, 0.94, 0.0898], [0, 0.139, 0.602, 0.0434], [0.0232, 0.0929, 0.802, 0.299], [0.0464, 0.627, 0.747, 0.136], [0.0464, 0.65, 0.492, 0.0898], [0.0464, 0.488, 0.715, 0.0201], [0.0232, 0.0929, 0.92, 0.159], [0, 1.6, 0.123, 0.0898], [0, 1.18, 0.052, 0.0434], [0, 1.07, 0.00299, 0.0201], [0, 1.07, 0.054, 0.0201], [0, 0.65, 0.051, 0.0201], [0, 0.163, 0.789, 0.136], [0, 0.139, 0.758, 0.136], [0, 2, 0.233, 0.0201], [0, 1.7, 0.15, 0.252], [0, 1.42, 0.0763, 0.0201], [0, 1.6, 0.124, 0.0434], [0, 1.56, 0.132, 0.0898], [0, 1.32, 0.0756, 0.136], [0, 0.766, 0.128, 0.0201], [0.0232, 0.418, 0.0556, 0.0201], [0.0464, 1.72, 0.0445, 0.0434], [0.0464, 2, 0.315, 0.276], [0.0464, 0.255, 0.77, 0.159], [0.116, 0.488, 0.859, 0.113], [0.0464, 0.163, 0.855, 0.252], [0.0929, 0.673, 0.651, 0.5], [0, 0.372, 0.0391, 0.0201], [0, 0.789, 0.0757, 0.5], [0, 1.58, 0.12, 0.5], [0.0464, 0.627, 0.682, 0.5], [0.163, 0.488, 0.944, 0.5], [0.0697, 0.0929, 0.962, 0.5], [0.0929, 0.743, 0.979, 0.5], [0.186, 2, 0.892, 0.276], [0.0464, 0.0929, 0.868, 0.113], [0.0697, 0.279, 0.255, 0.368], [0.0232, 0.395, 0.035, 0.0201], [0.139, 0.186, 0.962, 0.136], [0.0464, 0.72, 0.444, 0.0434], [0, 1.14, 0.334, 0.136], [0, 0.0929, 0.687, 0.0666], [0.0232, 0.627, 0.828, 0.485], [0.0232, 2, 0.861, 0.136], [0.0929, 0.186, 0.838, 0.136], [0.0464, 0.186, 0.556, 0.113], [0.0232, 0.0464, 0.965, 0.0898], [0.0232, 0.186, 0.661, 0.0898], [0.0232, 2, 0.871, 0.0201], [0, 2, 0.67, 0.0201], [0.0232, 0.0464, 0.992, 0.136], [0.0232, 0.0929, 1, 0.0434], [0, 2, 0.658, 0.0201], [0.0464, 0.116, 0.759, 0.0434], [0.0232, 0.116, 0.576, 0.0201], [0.0464, 0.139, 0.726, 0.0201], [0.0232, 0.255, 0.519, 0.136], [0, 0.0464, 0.712, 0.0898], [0.0929, 0.163, 0.378, 0.113], [0.0232, 0.325, 0.174, 0.0201], [0.116, 0.163, 0.987, 0.159], [0.0232, 0.302, 0.516, 0.0201], [0.0232, 2, 0.814, 0.0201], [0, 0.139, 0.683, 0.0201], [0.0464, 2, 0.284, 0.159], [0, 0.139, 0.769, 0.0201], [0, 0.627, 0.503, 0.0201], [0, 1.16, 0.646, 0.229], [0.0232, 1.72, 0.445, 0.5], [0, 0.0464, 0.905, 0.0434], [0, 0.627, 0.632, 0.5], [0.441, 2, 0.217, 0.461], [0.0464, 0.975, 0.704, 0.252], [0, 0.511, 0.66, 0.5], [0.0929, 2.02, 0.0269, 0.5], [0.186, 1.6, 0.103, 0.5], [0.116, 0.998, 0.626, 0.5], [0.418, 0.65, 0.681, 0.5], [0.0232, 1.6, 0.199, 0.136], [0.418, 0.441, 0.703, 0.5], [0.0232, 0.998, 0.0314, 0.461], [0.0929, 1.72, 0.123, 0.5], [0, 1.44, 0.241, 0.5], [0.534, 2, 0.584, 0.5], [0.0232, 2, 0.885, 0.5], [0.0929, 1.51, 0.327, 0.5], [0.0232, 1.86, 0.238, 0.5], [0, 1.14, 0.0565, 0.252], [0, 0.604, 0.0565, 0.5], [0, 0.464, 0.062, 0.5], [0, 0.488, 0.0529, 0.0201], [0, 0.0232, 0.998, 0.0434], [0.0464, 0.882, 0.532, 0.252], [0, 0.279, 0.678, 0.0898], [0, 1.42, 0.0644, 0.5], [0, 0.116, 0.00112, 0.0201], [0, 0.488, 0.051, 0.0201], [3, 2, 0, 0.0201], [0, 0.975, 0.0521, 0.368], [0, 0.279, 0.0387, 0.0201], [0, 0.836, 0.0509, 0.0201], [0.627, 1.88, 4.54e-08, 0.0201], [0.0697, 0.163, 0.0072, 0.0201], [0.116, 0.255, 0.328, 0.299], [1.44, 2, 0.976, 0.5], [0.0232, 0.139, 0.0105, 0.5], [0, 0.209, 0.917, 0.5], [0.906, 2, 0.654, 0.5], [0.279, 2, 0.999, 0.5], [0, 0.302, 0.0269, 0.0201]];
const volumes = [1.5, 1, 1.05, 1.05, 1.1];
const vibrato = [
    0.5,
    0.6,
    0.4,
    0.7,
    0.8,
    0.9,
    0.3,
    1,
    0.4,
    0.2,
    0.1,
    3,
    0.5,
    0.3,
    0.2,
    0.6,
    5,
    4.5,
    5.5,
    1,
    3,
    4,
    6,
    4.5,
    8,
    8.5,
    7,
    6.5,
    5,
    9,
    10,
    2,
    5,
    4.5,
    5,
    7,
    3,
    3.5,
    6,
    6.5,
    12,
    11,
    10,
    8,
    15,
    0.5,
    1,
    0.2,
    8,
    7.5,
    9,
    9.5,
    6,
    6.5,
    7,
    0.1,
    10,
    9,
    7,
    8.5,
    8,
    7.5,
    9.5,
    10,
    12,
    11.5,
    11,
    10,
    9,
    8.5,
    7.5,
    10.5,
    7,
    6,
    5,
    4,
    2,
    5.5,
    3,
    2.5,
    5,
    6,
    4,
    3.5,
    7,
    6.5,
    4.5,
    5.5,
    3,
    3.5,
    4,
    5,
    6,
    2,
    4.5,
    3,
    1,
    1.5,
    2,
    2.5,
    3,
    4,
    5,
    6,
    8,
    7,
    6,
    5,
    3,
    9,
    10,
    7.5,
    0.1,
    0.2,
    0.3,
    0,
    0,
    0.5,
    1,
    0,
    0,
    0.5,
    0,
    0,
    0,
    0,
    0,
    0
]



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

function parseInstruments(arrayBuffer) {
    var dataView = new DataView(arrayBuffer);
    var instruments = [];
    var offset = 0;

    for (var octave = 0; octave < 5; octave++) {
        var octaveData = [];
        instruments.push(octaveData);

        for (var program = 0; program < 128; program++) {
            var programData = {
                mul: 0, data: [], adsr: []
            };

            // const loudness = -(255 - dataView.getUint8(offset)) / 4;
            programData.mul = volumes[octave];// Math.sqrt(10 ** (((-6) - loudness) / 20));//muls[octave];
            // offset++;

            programData.adsr = envelope[program];
            // for (let i = 0; i < 4; i++) {
            //     programData.adsr.push(dataView.getUint8(offset) / 255 * 5);
            //     offset++;
            // }

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
    // Generate the real and imaginary parts of the waveform
    inst.data.forEach(f => {
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

export function getVolumeMul(note) {
    const val = (note - 45) / 12;
    if (val <= 0) return volumes[0];
    if (val >= volumes.length - 1) return volumes[volumes.length - 1];
    const i = Math.floor(val);
    return volumes[i] + (volumes[i + 1] - volumes[i]) * (val - i);
}

export function getKSSampler(context, instId, octave = 2) {
    let inst = instruments[octave][instId];

    // Calculate the actual frequency of the sample

    let baseFrequency = 440 * Math.pow(2, (octave - 2));
    const karplusLength = Math.floor(context.sampleRate / baseFrequency);
    let frequency = context.sampleRate / karplusLength; 
    let buffer;

    // Check if the waveform for the given instrument and octave is already cached
    if (inst.ksSampler) {
        // If cached, return the cached sampler
        buffer = inst.ksSampler;
    } else {
        // If not cached, create the Karplus-Strong sampler
        let decay = quickfadeArray[instId];
        let samples = ksSampler(inst.data, context.sampleRate, 4, decay, karplusLength);


        buffer = context.createBuffer(1, samples.length, context.sampleRate);
        // Fill the buffer with the samples
        buffer.copyToChannel(samples, 0);
        // Create a Karplus-Strong sampler using the context
        inst.ksSampler = buffer;
        // Return the Karplus-Strong sampler
    }
    return {
        buffer: buffer,
        frequency: frequency,
    };
}

export { quickfadeArray, findClosestNumberIndex, vibrato };