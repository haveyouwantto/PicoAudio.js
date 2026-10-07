# PicoAudio.js

Web Audio API で MIDI (Standard MIDI File = SMF) を再生する JavaScript ライブラリです。
[cagpie/PicoAudio.js](https://github.com/cagpie/PicoAudio.js) のフォークで、発音エンジンを
3 種類から選べるようにし、必要なエンジンだけを含む複数のビルドを追加しています。

This is a fork of [cagpie/PicoAudio.js](https://github.com/cagpie/PicoAudio.js) with
three switchable sound engines and selectable builds, so a player can ship only the
engines it needs.

| `settings.soundQuality` | engine | needs an asset |
| --- | --- | --- |
| `0` | 8-bit style basic waveforms (upstream oscillators) | no |
| `1` (default) | additive synthesis from a wavetable instrument set | built in table, or `loadWaves()` |
| `3` | deprecated slot, kept as an alias of `4` | - |
| `4` | SoundFont 2 (.sf2) playback, including GM drum kits | `loadSF2(buffer)` |

## 主な機能 / Features
- MIDIファイル(SMF)のパースと再生、noteOn/noteOff イベント
- `soundQuality` 0/1/4 の切り替え。1 は GM 128 音色 × 5 オクターブの加算合成
  (撥弦系にはフィルタ掃引付き)、4 は TinySoundFont 移植版または Web Audio ノードで SF2 を再生
- 長い音符のチャンク合成、オフライン描画 (`OfflineAudioContext`)、WAV 書き出し
- ビルドバリエーション: `basic` / `wave` / `wave-nodefault` / `sf2` /
  `sf2-wave-nodefault` / `full` (169 KB 〜 341 KB、[Build variants](#build-variants--ビルドバリエーション))
- 音源が未読み込みのときは自動で basic エンジンにフォールバック

## サンプル / Samples (upstream のデモ / demos of the upstream library)

- [Sample1](https://cagpie.github.io/PicoAudio.js/sample/cdn-sample1.html)
- [Sample2](https://cagpie.github.io/PicoAudio.js/sample/cdn-sample2.html)

## 利用されているプロダクト / Used by

- [Picotune](http://picotune.me) by @cagpie
- [Tonyu System 2](https://www.tonyu.jp/Tonyu2.php) by @hoge1e3
  (どちらも upstream の PicoAudio.js を利用しています / both use upstream PicoAudio.js)

## 導入方法

### Browser
```html
<script src="https://unpkg.com/@maple-kaede/picoaudio/dist/browser/PicoAudio.js"></script>
または、
<script src="https://unpkg.com/@maple-kaede/picoaudio/dist/browser/PicoAudio.min.js"></script>
```
※ グローバル変数に `PicoAudio` が定義されます
※ ビルドバリエーションを使う場合は `PicoAudio.basic.min.js` などのファイル名に置き換えてください


### Module
```bash
$ npm install @maple-kaede/picoaudio
```
https://www.npmjs.com/package/@maple-kaede/picoaudio

## はじめ方

### 初期化

```javascript
const picoAudio = new PicoAudio();
picoAudio.init();
```


### 再生

```javascript
// Standard MIDI Fileの準備
const file = /* FileReaderやFetchなどで取得 */
const smfData = new Uint8Array(file);

// SMF形式のバイナリのパースを行う
const parsedData = picoAudio.parseSMF(smfData);

// パースしたデータをセット
picoAudio.setData(parsedData);

// 再生
picoAudio.play();
```
※ `PicoAudio.play` メソッドは、ユーザのジェスチャーイベントから呼び出す必要がある場合があります ([参考](https://developers.google.com/web/updates/2017/09/autoplay-policy-changes#webaudio))

### 停止
```javascript
// 一時停止
picoAudio.pause();
```


## API

### Main Functions

#### PicoAudio.init
```typescript
// PicoAudioインスタンスの生成
new PicoAudio({
  debug: boolean, // デバッグON/OFF
  audioContext: AudioContext, // 生成済みのAudioContextを再利用
  picoAudio: PicoAudio, // 生成済みのPicoAudioインスタンスを再利用
}): PicoAudio
```
※ 細かいパラメータも設定可能 ([参考](https://github.com/cagpie/PicoAudio.js/blob/master/src/init/constructor.js))

#### PicoAudio.parseSMF
```typescript
// SMFファイルをパースし、PicoAudioで再生できる形式にする
// ピアノロールの描画を行いたい場合などに、ParsedSMFが利用できる
PicoAudio.parseSMF(smfFile: Uint8Array): ParsedSMF
```

#### PicoAudio.setData
```typescript
// パースされたデータをセットする
PicoAudio.setData(parsedSMF: ParsedSMF): void
```

#### PicoAudio.play
```typescript
// セットされているデータで再生する
PicoAudio.play(isLoop: boolean): void
```

#### PicoAudio.pause
```typescript
// 楽曲の一時停止
PicoAudio.pause(): void
```

#### PicoAudio.initStatus
```typescript
// 再生状態の初期化
PicoAudio.initStatus(): void
```

#### PicoAudio.setStartTime
```typescript
// 再生開始位置の設定
PicoAudio.setStartTime(offseTime: number) :void
```

#### ステータスのSetter/Getter
```typescript
// 全体音量の設定
PicoAudio.getMasterVolume(): number
PicoAudio.setMasterVolume(volume: number): void

// リバーブの設定
PicoAudio.isReverb(): boolean
PicoAudio.setReverb(enable: boolean): void
PicoAudio.getReverbVolume(): number
PicoAudio.setReverbVolume(volume: number): void

// コーラスの設定
PicoAudio.isChorus(): boolean
PicoAudio.setChorus(enable: boolean): void
PicoAudio.getChorusVolume(): number
PicoAudio.setChorusVolume(volume: number): void

// チャンネルの音色情報や音量の設定
PicoAudio.initChannels(): void
PicoAudio.getChannels(): Array
PicoAudio.setChannels(channels: Array): void

// ループの設定
PicoAudio.isLoop(): boolean
PicoAudio.setLoop(enable: boolean): void

// Web MIDI APIの設定
PicoAudio.isWebMIDI(): boolean
PicoAudio.setWebMIDI(enable: boolean): void

// Control Change 111 のループの設定
PicoAudio.isCC111(): boolean
PicoAudio.setCC111(enable: boolean): void
```


### Event周辺

#### PicoAudio.addEventListener
```typeScript
// イベントリスナを登録
PicoAudio.addEventListener(
  type: <'play' | 'pause' | 'noteOn' | 'noteOff' | 'songEnd'>,
  listener: Function
): void
```

##### PicoAudio.addEventListener (noteOn)
```typescript
// 音の開始イベントのリスナ登録ができる
// 発音される音のタイミングや高さ、強さなどが取得できる
PicoAudio.addEventListener(
  type: 'noteOn',
  listener: (event: NoteEvent) => void
): void

type NoteEvent = {
  channel: number, // チャンネル(0-15)
  instrument: number, // 楽器の種類(0-127)

  start: number, // 音の始まりのタイミング(tick=SMF時間)
  stop: number, // 音の終わりのタイミング(tick)
  startTime: number, // 音の始まりのタイミング(秒数)
  stopTime: number, // 音の終わりのタイミング(秒数)

  velocity: number, // ベロシティ(0-1)
  pitch: number, // 音の高さ(0-127)

  // CCパラメータ
  pan: CCEvent[],
  pitchBend: CCEvent[],
  expression: CCEvent[],
  modulation: CCEvent[],
  chorus: CCEvent[],
  reberb: CCEvent[],
}

type CCEvent = {
  timing: number, // タイミング(tick)
  time: number, // タイミング(秒数)
  value: number // 値(0-127)
}
```

##### PicoAudio.addEventListener (noteOff)
```typescript
// 音の終了イベントのリスナ登録ができる
PicoAudio.addEventListener(
  type: 'noteOff',
  listener: (event: NoteEvent) => void
): void
```

#### removeEventListener
```typescript
// 指定のイベントリスナを解除
PicoAudio.removeEventListener(
  type: <'play' | 'pause' | 'noteOn' | 'noteOff' | 'songEnd'>,
  listener: Function
): void
```

#### removeAllEventListener
```typescript
// 指定typeのイベントリスナをすべて解除
PicoAudio.removeAllEventListener(
  type: <'play' | 'pause' | 'noteOn' | 'noteOff' | 'songEnd'>
): void
```

### SMFパース周辺
#### parsed SMF
```typescript
// 準備中
```

##### 変換関数
##### PicoAudio.getTime
```typescript
// tick から 時間に変換 (テンポも考慮される)
PicoAudio.getTime(tick: number): number
```

##### PicoAudio.getTiming
```typescript
// 時間からtickに変換
PicoAudio.getTiming(time: number): number
```


## License
Code released under the MIT License

## SoundFont (SF2) 再生

`soundQuality = 4` のとき、PicoAudio は SoundFont2 (.sf2) ファイルで発音します。
エンジンは [TinySoundFont](https://github.com/schellingb/TinySoundFont) の JavaScript 移植版
(`src/player/sf2/tsf-font.js`, `tsf-synth.js`, `tsf.js`) で、プリセット/ゾーンの解決、
ボリューム/モジュレーション エンベロープ、フィルタ、LFO、ループ、パン、音量まで
参照実装と同じ計算を使います。そのため C 版 TinySoundFont とほぼ同一の波形になり、
ノート単位の照合で最大誤差 2.5e-6 です。

```javascript
// SoundFont2 ファイル (ArrayBuffer) を読み込む
picoAudio.loadSF2(arrayBuffer);   // -> boolean
picoAudio.isSF2Loaded();          // -> boolean

// サンプル補間アルゴリズムを選ぶ
//   'linear'  : 既定。TinySoundFont (参照実装) と同じ
//   'nearest' : 最軽量、やや粗い
//   'cubic'   : 4点 Catmull-Rom、最も滑らか
picoAudio.setSF2Interpolation('cubic');
picoAudio.getSF2Interpolation();
```

`settings.soundQuality = 4` と併せて `settings.sf2Interpolation` を直接設定しても構いません。
ドラム (MIDI チャンネル 10) は GM のキットバンク (bank 128) からプリセットを選びます。

長い音符は**チャンク単位でストリーミング合成**されます。音符を開始した瞬間に必要なのは
先頭 2 秒分だけで、残りは再生に合わせて少しずつ合成されるため、数秒〜数十秒の持続音でも
メインスレッドが固まりません (60 秒の音符で 42ms → 1.2ms、メモリ 20MB → 0.7MB)。
`OfflineAudioContext` (WAV/動画書き出し) では従来どおり一括合成します。
`settings.sf2Streaming = false` で無効化できます。
バックグラウンドのタブではタイマーが間引かれるため、非表示になった時点で
再生中の音符の残りを全て合成し、以降の音符は一括合成に切り替えます (音が途切れません)。


## Build variants / ビルドバリエーション

Four bundles are built from the same sources. They only differ in which sound
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

FM tones: [sneakernets/DMXOPL](https://github.com/sneakernets/DMXOPL) (MIT License)

SF2 synthesis: [TinySoundFont](https://github.com/schellingb/TinySoundFont)
© Bernhard Schelling, based on SFZero © Steve Folta (MIT License) — ported to JavaScript in
`src/player/sf2/tsf-font.js`, `src/player/sf2/tsf-synth.js` and `src/player/sf2/tsf.js`.
The upstream copyright notice is kept in those files.
