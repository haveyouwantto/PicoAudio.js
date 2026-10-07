# PicoAudio.js

Web Audio API で MIDI (Standard MIDI File = SMF) を再生する JavaScript ライブラリです。
[cagpie/PicoAudio.js](https://github.com/cagpie/PicoAudio.js) のフォークで、発音エンジンを
3 種類から選べるようにし、必要なエンジンだけを含むビルドを追加しています。

[English](README.md)

| `settings.soundQuality` | 発音エンジン | 必要な音源 |
| --- | --- | --- |
| `0` | 8bit 風の基本波形 (upstream のオシレータ) | 不要 |
| `1` (既定) | 波形テーブルによる加算合成 | 内蔵テーブル、または `loadWaves()` |
| `3` | 廃止 (4 の別名) | - |
| `4` | SoundFont2 (.sf2) 再生 (GM ドラムキット込み) | `loadSF2(buffer)` |

## 主な機能

- SMF (Standard MIDI File) のパースと再生、noteOn/noteOff イベント
- `soundQuality` 0 / 1 / 4 の切り替え。1 は GM 128 音色 × 5 オクターブの加算合成
  (撥弦系にはフィルタ掃引付き)、4 は TinySoundFont 移植版または Web Audio ノードで
  SoundFont2 を再生
- 長い音符のチャンク単位のストリーミング合成、オフライン描画
  (`OfflineAudioContext`)、WAV 書き出し
- 音源が未読み込みのときは自動で basic エンジンにフォールバック
- ビルドバリエーション: `basic` / `wave` / `wave-nodefault` / `sf2` /
  `sf2-wave-nodefault` / `full` (170 KB 〜 341 KB、
  [ビルドバリエーション](#ビルドバリエーション) 参照)

## サンプル

upstream のデモです。

- [Sample1](https://cagpie.github.io/PicoAudio.js/sample/cdn-sample1.html)
- [Sample2](https://cagpie.github.io/PicoAudio.js/sample/cdn-sample2.html)

## 利用されているプロダクト

- [Picotune](http://picotune.me) by @cagpie
- [Tonyu System 2](https://www.tonyu.jp/Tonyu2.php) by @hoge1e3

(どちらも upstream の PicoAudio.js を利用しています)

## 導入方法

### Browser

```html
<script src="https://unpkg.com/@maple-kaede/picoaudio/dist/browser/PicoAudio.min.js"></script>
```

グローバル変数に `PicoAudio` が定義されます。小さいビルドを使いたい場合は
`PicoAudio.basic.min.js`、`PicoAudio.wave.min.js` などに置き換えてください。

### Module

```bash
npm install @maple-kaede/picoaudio
```

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
※ `settings` の各項目も同じオブジェクトで上書きできます ([参考](https://github.com/haveyouwantto/PicoAudio.js/blob/master/src/init/constructor.js))

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

#### 音源まわり
```typescript
// このビルドに含まれるエンジン: { wave: boolean, sf2: boolean }
PicoAudio.features

// 波形テーブル音源 (soundQuality 1) をバイナリで読み込む
PicoAudio.loadWaves(buffer: ArrayBuffer): void

// SoundFont2 ファイル (soundQuality 4)
PicoAudio.loadSF2(buffer: ArrayBuffer): boolean
PicoAudio.isSF2Loaded(): boolean

// サンプル補間: 'linear' (既定、TinySoundFont と同じ) / 'nearest' / 'cubic'
PicoAudio.setSF2Interpolation(mode): void
PicoAudio.getSF2Interpolation(): string

// 廃止された音源。呼んでも何もしません (soundQuality 3 は SF2 を再生)
PicoAudio.loadSamples(buffer: ArrayBuffer): void
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

## ビルドバリエーション

同じソースから 6 種類のバンドルをビルドします。違いは**どの発音エンジンを埋め込むか**だけで、
ビルドごとに `src/features.js` を差し替えるため、含めないエンジン (および内蔵の波形テーブル) は
単に無効化されるのではなくバンドルから取り除かれます。

| ビルド | nodejs esm | `soundQuality` | サイズ (nodejs esm) |
| --- | --- | --- | --- |
| `full` (既定) | `dist/nodejs/picoaudio.mjs` | 0, 1, 4 | 341 KB |
| `sf2-wave-nodefault` | `dist/nodejs/picoaudio.sf2-wave-nodefault.mjs` | 0, 1, 4 (内蔵テーブル無し) | 302 KB |
| `sf2` | `dist/nodejs/picoaudio.sf2.mjs` | 0, 4 | 279 KB |
| `wave` | `dist/nodejs/picoaudio.wave.mjs` | 0, 1 | 232 KB |
| `wave-nodefault` | `dist/nodejs/picoaudio.wave-nodefault.mjs` | 0, 1 (内蔵テーブル無し) | 192 KB |
| `basic` | `dist/nodejs/picoaudio.basic.mjs` | 0 | 170 KB |

ブラウザ用には各ビルドを `dist/browser/PicoAudio[.variant].js` と `.min.js` としても出力します。

`soundQuality` 0 は基本波形 (upstream の機能セット)、1 は周期波形/波形テーブル、
4 は SoundFont2 (`loadSF2`) です。旧サンプル音源の 3 は廃止し、3 は SF2 を再生します。
`basic` ビルドにも打楽器は含まれます (upstream と同じくオシレータとノイズで合成)。

```bash
npm run build                # 全ビルド
npm run build:full           # 個別にビルドする場合:
npm run build:sf2            # build:sf2-wave-nodefault, build:wave,
npm run build:wave           # build:wave-nodefault, build:basic
```

実行時に `PicoAudio.features` でそのビルドに含まれるエンジンが分かります
(例: `{ wave: true, sf2: true }`)。

読み込まれていないエンジンは使いません。波形テーブル / SoundFont を読み込まずに
`soundQuality` 1 や 4 を選んだ場合、あるいはそのエンジンを含まないビルドでは、
無音ではなく basic 波形エンジンで発音します。SF2 エンジンを含まないビルドでは
`loadSF2()` が `false` を返し、`loadSamples()` は何もしない (廃止) 関数です。

`wave-nodefault` ビルドは波形テーブルを一切内蔵していないため、波形テーブルモードを
使う場合は `picoAudio.loadWaves(buffer)` で自前のテーブルを渡してください。
それまでは `soundQuality: 1` は basic エンジンで発音します。

## Credits

Upstream: [cagpie/PicoAudio.js](https://github.com/cagpie/PicoAudio.js) (MIT License)

FM tones: [sneakernets/DMXOPL](https://github.com/sneakernets/DMXOPL) (MIT License)

SF2 synthesis: [TinySoundFont](https://github.com/schellingb/TinySoundFont)
© Bernhard Schelling, based on SFZero © Steve Folta (MIT License) — ported to JavaScript in
`src/player/sf2/tsf-font.js`, `src/player/sf2/tsf-synth.js` and `src/player/sf2/tsf.js`.
The upstream copyright notice is kept in those files.
