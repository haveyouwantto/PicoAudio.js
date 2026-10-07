# PicoAudio.js

A JavaScript library that parses and plays Standard MIDI Files on the web with
the Web Audio API. This is a fork of
[cagpie/PicoAudio.js](https://github.com/cagpie/PicoAudio.js) that adds three
switchable sound engines and builds that contain only the engines you need.

[日本語はこちら / Japanese](README.ja.md)

| `settings.soundQuality` | engine | asset needed |
| --- | --- | --- |
| `0` | 8-bit style basic waveforms (upstream oscillators) | none |
| `1` (default) | additive synthesis from a wavetable instrument set | built in table, or `loadWaves()` |
| `3` | deprecated slot, kept as an alias of `4` | – |
| `4` | SoundFont 2 (`.sf2`) playback, GM drum kits included | `loadSF2(buffer)` |

## Features

- Parses SMF (Standard MIDI File) and plays it back, including noteOn/noteOff
  events
- `soundQuality` 0 / 1 / 4: basic oscillators, additive synthesis from a
  128 program x 5 octave wavetable set (plucked programs get a filter sweep),
  or SoundFont 2 played by a TinySoundFont port or by native Web Audio nodes
- Chunked synthesis for very long notes, offline rendering
  (`OfflineAudioContext`) and WAV export
- Engines that are not ready are never used: a wavetable / soundfont mode
  without its table / font loaded plays the basic engine instead
- Build variants: `basic` / `wave` / `wave-nodefault` / `sf2` /
  `sf2-wave-nodefault` / `full` (170 KB - 341 KB, see
  [Build variants](#build-variants))

## Samples

Demos of the upstream library:

- [Sample1](https://cagpie.github.io/PicoAudio.js/sample/cdn-sample1.html)
- [Sample2](https://cagpie.github.io/PicoAudio.js/sample/cdn-sample2.html)

## Used by

- [Picotune](http://picotune.me) by @cagpie
- [Tonyu System 2](https://www.tonyu.jp/Tonyu2.php) by @hoge1e3

(both use the upstream PicoAudio.js)

## Install

### Browser

```html
<script src="https://unpkg.com/@maple-kaede/picoaudio/dist/browser/PicoAudio.min.js"></script>
```

A global `PicoAudio` is defined. Use `PicoAudio.basic.min.js`,
`PicoAudio.wave.min.js`, ... to load a smaller build variant.

### Module

```bash
npm install @maple-kaede/picoaudio
```

## Getting started

### Create an instance

```javascript
const picoAudio = new PicoAudio();
picoAudio.init();
```

### Play

```javascript
// Prepare a Standard MIDI File
const file = /* from FileReader, fetch, ... */
const smfData = new Uint8Array(file);

// Parse the SMF binary
const parsedData = picoAudio.parseSMF(smfData);

// Hand the parsed data to the player
picoAudio.setData(parsedData);

// Play
picoAudio.play();
```
Note: `PicoAudio.play` may have to be called from a user gesture
([reference](https://developers.google.com/web/updates/2017/09/autoplay-policy-changes#webaudio)).

### Stop

```javascript
// Pause
picoAudio.pause();
```

## API

### Main Functions

#### PicoAudio.init
```typescript
// Create a PicoAudio instance
new PicoAudio({
  debug: boolean, // debug on/off
  audioContext: AudioContext, // reuse an existing AudioContext
  picoAudio: PicoAudio, // reuse an existing PicoAudio instance
}): PicoAudio
```
Every entry of `settings` can be overridden through the same object (see
[constructor.js](https://github.com/haveyouwantto/PicoAudio.js/blob/master/src/init/constructor.js)).

#### PicoAudio.parseSMF
```typescript
// Parse an SMF file into the format PicoAudio plays back
// The ParsedSMF is also useful for drawing a piano roll etc.
PicoAudio.parseSMF(smfFile: Uint8Array): ParsedSMF
```

#### PicoAudio.setData
```typescript
// Set the parsed data
PicoAudio.setData(parsedSMF: ParsedSMF): void
```

#### PicoAudio.play
```typescript
// Play the data that is currently set
PicoAudio.play(isLoop: boolean): void
```

#### PicoAudio.pause
```typescript
// Pause playback
PicoAudio.pause(): void
```

#### PicoAudio.initStatus
```typescript
// Reset the playback state
PicoAudio.initStatus(): void
```

#### PicoAudio.setStartTime
```typescript
// Set the playback position
PicoAudio.setStartTime(offseTime: number) :void
```

#### Status setters / getters
```typescript
// Master volume
PicoAudio.getMasterVolume(): number
PicoAudio.setMasterVolume(volume: number): void

// Reverb
PicoAudio.isReverb(): boolean
PicoAudio.setReverb(enable: boolean): void
PicoAudio.getReverbVolume(): number
PicoAudio.setReverbVolume(volume: number): void

// Chorus
PicoAudio.isChorus(): boolean
PicoAudio.setChorus(enable: boolean): void
PicoAudio.getChorusVolume(): number
PicoAudio.setChorusVolume(volume: number): void

// Per channel instrument and volume
PicoAudio.initChannels(): void
PicoAudio.getChannels(): Array
PicoAudio.setChannels(channels: Array): void

// Looping
PicoAudio.isLoop(): boolean
PicoAudio.setLoop(enable: boolean): void

// Web MIDI API
PicoAudio.isWebMIDI(): boolean
PicoAudio.setWebMIDI(enable: boolean): void

// Control Change 111 looping
PicoAudio.isCC111(): boolean
PicoAudio.setCC111(enable: boolean): void
```

#### Sound sources
```typescript
// Which engines this build contains: { wave: boolean, sf2: boolean }
PicoAudio.features

// Wavetable instrument set (soundQuality 1) as a binary buffer
PicoAudio.loadWaves(buffer: ArrayBuffer): void

// SoundFont 2 file (soundQuality 4)
PicoAudio.loadSF2(buffer: ArrayBuffer): boolean
PicoAudio.isSF2Loaded(): boolean

// Sample interpolation: 'linear' (default, TinySoundFont), 'nearest', 'cubic'
PicoAudio.setSF2Interpolation(mode): void
PicoAudio.getSF2Interpolation(): string

// Removed engine, kept as a no-op: 3 now plays the SoundFont engine
PicoAudio.loadSamples(buffer: ArrayBuffer): void
```

### Events

#### PicoAudio.addEventListener
```typeScript
// Register an event listener
PicoAudio.addEventListener(
  type: <'play' | 'pause' | 'noteOn' | 'noteOff' | 'songEnd'>,
  listener: Function
): void
```

##### PicoAudio.addEventListener (noteOn)
```typescript
// Listen to note starts: timing, pitch and velocity of every note
PicoAudio.addEventListener(
  type: 'noteOn',
  listener: (event: NoteEvent) => void
): void

type NoteEvent = {
  channel: number, // channel (0-15)
  instrument: number, // instrument (0-127)

  start: number, // note start (tick = SMF time)
  stop: number, // note end (tick)
  startTime: number, // note start (seconds)
  stopTime: number, // note end (seconds)

  velocity: number, // velocity (0-1)
  pitch: number, // pitch (0-127)

  // CC parameters
  pan: CCEvent[],
  pitchBend: CCEvent[],
  expression: CCEvent[],
  modulation: CCEvent[],
  chorus: CCEvent[],
  reberb: CCEvent[],
}

type CCEvent = {
  timing: number, // timing (tick)
  time: number, // timing (seconds)
  value: number // value (0-127)
}
```

##### PicoAudio.addEventListener (noteOff)
```typescript
// Listen to note ends
PicoAudio.addEventListener(
  type: 'noteOff',
  listener: (event: NoteEvent) => void
): void
```

#### removeEventListener
```typescript
// Remove one listener
PicoAudio.removeEventListener(
  type: <'play' | 'pause' | 'noteOn' | 'noteOff' | 'songEnd'>,
  listener: Function
): void
```

#### removeAllEventListener
```typescript
// Remove every listener of one type
PicoAudio.removeAllEventListener(
  type: <'play' | 'pause' | 'noteOn' | 'noteOff' | 'songEnd'>
): void
```

### SMF parsing
#### parsed SMF
```typescript
// work in progress
```

##### Conversion helpers
##### PicoAudio.getTime
```typescript
// tick -> seconds (tempo changes are taken into account)
PicoAudio.getTime(tick: number): number
```

##### PicoAudio.getTiming
```typescript
// seconds -> tick
PicoAudio.getTiming(time: number): number
```

## License
Code released under the MIT License

## SoundFont (SF2) playback

With `soundQuality = 4` PicoAudio plays SoundFont 2 (`.sf2`) files. The engine is
a JavaScript port of [TinySoundFont](https://github.com/schellingb/TinySoundFont)
(`src/player/sf2/tsf-font.js`, `tsf-synth.js`, `tsf.js`): preset/zone resolution,
volume and modulation envelopes, filters, LFOs, loops, pan and gain all use the
same maths as the reference implementation, so the waveform matches the C
version to within 2.5e-6 in per note comparisons.

```javascript
// Load a SoundFont 2 file (ArrayBuffer)
picoAudio.loadSF2(arrayBuffer);   // -> boolean
picoAudio.isSF2Loaded();          // -> boolean

// Pick the sample interpolation
//   'linear'  : default, same as TinySoundFont (the reference implementation)
//   'nearest' : cheapest, a bit rough
//   'cubic'   : 4 point Catmull-Rom, smoothest
picoAudio.setSF2Interpolation('cubic');
picoAudio.getSF2Interpolation();
```

`settings.soundQuality = 4` and `settings.sf2Interpolation` can be set directly
as well. Drums (MIDI channel 10) pick their preset from the GM kit bank
(bank 128).

Long notes are **synthesised in chunks**: starting a note only needs the first
two seconds, the rest is rendered as playback catches up, so even a note that
lasts tens of seconds does not block the main thread (a 60 s note went from
42 ms to 1.2 ms per update and from 20 MB to 0.7 MB of samples).
`OfflineAudioContext` rendering (WAV/video export) still renders in one go.
Set `settings.sf2Streaming = false` to disable chunked synthesis.
Background tabs get their timers throttled, so when the document becomes hidden
the remainder of every sounding note is rendered immediately and later notes
fall back to one shot rendering (no dropouts).

## Build variants

Six bundles are built from the same sources. They only differ in which sound
engines are compiled in: `src/features.js` is replaced per variant, so the
excluded engines (and the embedded waveform table) are dropped from the bundle
instead of merely being switched off at runtime.

| variant | nodejs esm | `soundQuality` | size (nodejs esm) |
| --- | --- | --- | --- |
| `full` (default) | `dist/nodejs/picoaudio.mjs` | 0, 1, 4 | 341 KB |
| `sf2-wave-nodefault` | `dist/nodejs/picoaudio.sf2-wave-nodefault.mjs` | 0, 1, 4 (no built in table) | 302 KB |
| `sf2` | `dist/nodejs/picoaudio.sf2.mjs` | 0, 4 | 279 KB |
| `wave` | `dist/nodejs/picoaudio.wave.mjs` | 0, 1 | 232 KB |
| `wave-nodefault` | `dist/nodejs/picoaudio.wave-nodefault.mjs` | 0, 1 (no built in table) | 192 KB |
| `basic` | `dist/nodejs/picoaudio.basic.mjs` | 0 | 170 KB |

Every variant is also built for the browser as
`dist/browser/PicoAudio[.variant].js` and `.min.js`.

`soundQuality` 0 is the basic oscillator mode (the upstream PicoAudio feature
set), 1 the periodic wave / wavetable mode and 4 SoundFont 2 playback
(`loadSF2`). The old sample bank value 3 is gone: 3 now plays SF2. The `basic`
build keeps percussion, that kit is synthesised from oscillators and noise,
like upstream.

```bash
npm run build                # build every variant
npm run build:full           # ...or one of them:
npm run build:sf2            # build:sf2-wave-nodefault, build:wave,
npm run build:wave           # build:wave-nodefault, build:basic
```

At runtime `PicoAudio.features` reports what a bundle contains, e.g.
`{ wave: true, sf2: true }`.

Engines that are not ready are never used: selecting `soundQuality` 1 or 4
without a loaded wavetable / soundfont - or in a build that does not contain
that engine at all - plays the basic waveform engine instead, so a player that
has not prepared its sound source still makes sound. `loadSF2()` returns
`false` in builds without the SF2 engine, and `loadSamples()` is a deprecated
no-op (that engine is gone).

The `wave-nodefault` build carries no waveform table at all, so a host that
wants the wavetable mode must supply its own: `picoAudio.loadWaves(buffer)`
before the first note. Until then `soundQuality: 1` plays the basic engine.

## Credits

Upstream: [cagpie/PicoAudio.js](https://github.com/cagpie/PicoAudio.js) (MIT License)

FM tones: [sneakernets/DMXOPL](https://github.com/sneakernets/DMXOPL) (MIT License)

SF2 synthesis: [TinySoundFont](https://github.com/schellingb/TinySoundFont)
© Bernhard Schelling, based on SFZero © Steve Folta (MIT License) — ported to JavaScript in
`src/player/sf2/tsf-font.js`, `src/player/sf2/tsf-synth.js` and `src/player/sf2/tsf.js`.
The upstream copyright notice is kept in those files.
