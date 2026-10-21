import RandomUtil from '../util/random-util.js';
import InterpolationUtil from '../util/interpolation-util.js';
import { generatePinkNoise } from '../player/audio/sound-gen.js';
import AudioUtil from '../util/audio-util.js';
import Waveform from '../player/audio/dsp.js';
import { prepareSF2Worklet } from '../player/sound-source/sf2-worklet-renderer.js';
import { HAS_SF2 } from '../features.js';

/* ------------------------------------------------------------ noise cache -- */

/**
 * White / pink / cymbal noise tables and the reverb impulse response.
 *
 * Together they are 1 s + 1 s + 1 s + 3.5 s of stereo audio, built with a
 * 65536 point IFFT (miniFFT dominates the profile), which costs ~250 ms of main
 * thread time. It used to run again for every PicoAudio instance, and the app
 * creates more than one: the composer loads a font, the WAV export renders in an
 * OfflineAudioContext, and a player rebuild makes a third.
 * test_samples/browser/rt-profile.mjs?norender=1 measured init() at 258 ms and
 * a single 733 ms long task on a page that had not played a note yet.
 *
 * The generators are seeded (RandomUtil, except the pink noise which draws from
 * Math.random once per build), so the result depends only on the sample rate -
 * that is the cache key. AudioBuffers are plain data containers in Web Audio,
 * not owned by the context that created them, so one set is shared by every
 * context with the same rate.
 */
const noiseCache = new Map();

function buildNoiseSet(context, sampleRate, sampleRateVT) {
    // ホワイトノイズ: 仮想サンプルレートで生成してから実レートに変換する
    // (再生環境のサンプルレートによって音が変わらないように)
    RandomUtil.resetSeed(); // 乱数パターンを固定にする（Math.random()を使わない）
    const vtBufs = [];
    for (let ch = 0; ch < 2; ch++) {
        const vtBuf = new Float32Array(sampleRateVT);
        for (let i = 0; i < sampleRateVT; i++) {
            const r = RandomUtil.random();
            vtBuf[i] = r * 2 - 1;
        }
        vtBufs.push(vtBuf);
    }
    const whitenoise = context.createBuffer(2, sampleRate, sampleRate);
    InterpolationUtil.lerpWave(whitenoise, vtBufs);

    const pinknoise = context.createBuffer(2, sampleRate, sampleRate);
    AudioUtil.fillAudioBuffer(pinknoise, 0, generatePinkNoise(sampleRate));
    AudioUtil.fillAudioBuffer(pinknoise, 1, generatePinkNoise(sampleRate));

    const cymbalnoise = context.createBuffer(2, sampleRate, sampleRate);
    AudioUtil.fillAudioBuffer(cymbalnoise, 0,
        Waveform.WhiteNoise(sampleRate, 1)
            .highPass(8000)
            .norm().samples
    );
    AudioUtil.fillAudioBuffer(cymbalnoise, 1,
        Waveform.WhiteNoise(sampleRate, 1)
            .highPass(8000)
            .norm().samples
    );

    // リバーブ用のインパルス応答音声データ作成（てきとう） //
    const irLength = Math.round(sampleRate * 3.5);
    const irLengthVT = Math.round(sampleRateVT * 3.5);
    RandomUtil.resetSeed(); // 乱数パターンを固定にする（Math.random()を使わない）
    const irBufs = [];
    for (let ch = 0; ch < 2; ch++) {
        const vtBuf = new Float32Array(irLengthVT);
        for (let i = 0; i < irLengthVT; i++) {
            const v = ((irLengthVT - i) / irLengthVT);
            const s = i / sampleRateVT;
            const d = (s < 0.030 ? 0 : v)
                * (s >= 0.030 && s < 0.031 ? v * 2 : v)
                * (s >= 0.040 && s < 0.042 ? v * 1.5 : v)
                * (s >= 0.050 && s < 0.054 ? v * 1.25 : v)
                * RandomUtil.random() * 0.2 * Math.pow((v - 0.030), 4);
            vtBuf[i] = d;
        }
        irBufs.push(vtBuf);
    }
    const impulseResponse = context.createBuffer(2, irLength, sampleRate);
    InterpolationUtil.lerpWave(impulseResponse, irBufs);

    return { whitenoise, pinknoise, cymbalnoise, impulseResponse };
}

function getNoiseSet(context, sampleRate, sampleRateVT) {
    let set = noiseCache.get(sampleRate);
    if (!set) {
        set = buildNoiseSet(context, sampleRate, sampleRateVT);
        noiseCache.set(sampleRate, set);
    }
    return set;
}


export default function init(argsObj) {
    if (this.isStarted) return;
    this.isStarted = true;

    const audioContext = argsObj && argsObj.audioContext;
    const picoAudio = argsObj && argsObj.picoAudio;

    // AudioContextを生成 //
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.context = audioContext ? audioContext : new AudioContext({ latencyHint: "balanced" });

    // A hidden tab throttles timers, which used to be worked around by
    // finishing every sounding note on the spot and switching the engine to
    // whole-note renders. Neither exists any more: whole-note rendering was
    // removed (see the note in sf2-renderer.js) and the AudioWorklet does not
    // depend on timers at all. What is left is the honest trade - a background
    // tab may drop DSP-streamed notes instead of freezing the page to fill
    // their buffers.

    // マスターボリューム //
    // リアルタイムで音量変更するためにdestination前にgainNodeを一つ噛ませる
    this.masterGainNode = this.context.createGain();
    this.masterGainNode.gain.value = this.settings.masterVolume;

    this.highFilter = this.context.createBiquadFilter();
    this.highFilter.frequency.value = 20;
    this.highFilter.type = 'highpass';

    // Add a dynamics compressor to prevent overloading
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -12;

    // 仮想サンプルレート //
    const sampleRate = this.context.sampleRate;
    const sampleRateVT = sampleRate >= 48000 ? 48000 : sampleRate;

    // ノイズ・インパルス応答はレートごとに一度だけ生成して全インスタンスで共有する
    const noiseSet = getNoiseSet(this.context, sampleRate, sampleRateVT);
    this.whitenoise = (picoAudio && picoAudio.whitenoise) || noiseSet.whitenoise;
    this.pinknoise = noiseSet.pinknoise;
    this.cymbalnoise = noiseSet.cymbalnoise;

    // Fill pre-calculated vibrato samples
    const vibratoLength = Math.floor(sampleRate * 0.1);
    this.vibratoSamples = new Float32Array(vibratoLength);
    for (let i = 0; i < vibratoLength; i++) {
        this.vibratoSamples[i] = Math.sin(2 * Math.PI * 600 * (i / sampleRate));
    }

    this.vibratoCache = []

    this.impulseResponse = (picoAudio && picoAudio.impulseResponse) || noiseSet.impulseResponse;

    // リバーブ用のAudioNode作成・接続 //
    this.convolver = this.context.createConvolver();
    this.convolver.buffer = this.impulseResponse;
    this.convolver.normalize = true;
    this.convolverGainNode = this.context.createGain();
    this.convolverGainNode.gain.value = this.settings.reverbVolume;
    this.convolver.connect(this.convolverGainNode);
    this.convolverGainNode.connect(this.masterGainNode);

    // コーラス用のAudioNode作成・接続 //
    this.chorusDelayNode = this.context.createDelay();
    this.chorusGainNode = this.context.createGain();
    this.chorusOscillator = this.context.createOscillator();
    this.chorusLfoGainNode = this.context.createGain();
    this.chorusDelayNode.delayTime.value = 0.025;
    this.chorusLfoGainNode.gain.value = 0.010;
    this.chorusOscillator.frequency.value = 0.05;
    this.chorusGainNode.gain.value = this.settings.chorusVolume;
    this.chorusOscillator.connect(this.chorusLfoGainNode);
    this.chorusLfoGainNode.connect(this.chorusDelayNode.delayTime);
    this.chorusDelayNode.connect(this.chorusGainNode);
    this.chorusGainNode.connect(this.masterGainNode);
    this.masterGainNode.connect(this.highFilter);
    this.highFilter.connect(this.compressor);
    this.compressor.connect(this.context.destination);
    this.chorusOscillator.start(0);

    this.setGlobalReverb(this.settings.globalReverb);

    // レイテンシの設定 //
    this.baseLatency = this.context.baseLatency || this.baseLatency;
    if (this.settings.baseLatency != -1) {
        this.baseLatency = this.settings.baseLatency;
    }

    // The AudioWorklet engine loads its module asynchronously; start that now so
    // playback does not have to fall back for the first notes.
    if (HAS_SF2 && this.settings.sf2Engine === 'worklet') prepareSF2Worklet(this);
}
