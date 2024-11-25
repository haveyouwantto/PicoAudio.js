## PicoAudio Data Type Documentation

### Periodic Wave Table

The **Periodic Wave Table** stores precomputed harmonic data for MIDI instruments in a compact binary format. It includes 5 octaves of data, with each octave containing information for 128 MIDI instruments.

#### Structure:
- **5 Octaves**: Each octave has 128 instruments.
- **MIDI Instrument**: Each instrument has a set of harmonics.
  - **Length Byte**: 1 byte indicating the number of harmonics.
  - **Harmonics**: Quantized 8-bit values representing harmonic amplitudes.

#### Process:
1. The data is stored as binary and encoded in **Base64** for portability.
2. To use, decode the Base64 data and dequantize harmonics for synthesis.

### Soundbank Data Format

The **PicoAudio Soundbank** is a format for storing and accessing MIDI instruments and drum samples, organized into 6 octaves (5 for MIDI instruments, 1 for drums).

#### Structure:
- **Octaves 1-5**: Store 128 MIDI instruments each.
- **Octave 6**: Stores 128 drum samples (MIDI key 0-127).

#### Layout:
- **Instrument Data**:
  - **Length (int32)**: Size of the audio file.
  - **Audio File (n bytes)**: The audio data in browser supported formats like WAV, MP3, or OGG.
- **Drum Sample Data**:
  - **Length (int32)**: Size of the drum sample.
  - **Audio File (n bytes)**: Drum sample data.

#### Process:
1. The soundbank is serialized into binary with each entry prefixed by its length.
2. To decode, extract the length to read the corresponding audio data, and load it for playback.

### Summary:
- The **Periodic Wave Table** stores harmonic data for MIDI instruments, encoded in Base64 for easy access.
- The **PicoAudio Soundbank** organizes MIDI instruments and drum samples by octave, with each instrument's audio data sized and accessible for playback.


----

### PicoAudio データ形式ドキュメント

#### 周期波テーブル

**周期波テーブル**は、MIDI 楽器の事前計算されたハーモニクスデータをコンパクトなバイナリ形式で格納します。5オクターブのデータが含まれており、各オクターブには128のMIDI楽器の情報が含まれています。

##### 構造：
- **5オクターブ**：各オクターブには128楽器が含まれる。
- **MIDI 楽器**：各楽器には一連のハーモニクスが含まれる。
  - **長さバイト**：ハーモニクスの数を示す1バイト。
  - **ハーモニクス**：8ビットで量子化された振幅値。

##### 使用手順：
1. データはバイナリとして保存され、**Base64**でエンコードされる。
2. 使用時には、Base64データをデコードしてハーモニクスを逆量子化し、合成に利用する。

#### サウンドバンク

**PicoAudio サウンドバンク**は、MIDI 楽器とドラムサンプルを保存し、アクセスするためのフォーマットです。6オクターブ（MIDI楽器用5オクターブとドラム用1オクターブ）で構成されています。

##### 構造：
- **オクターブ 1-5**：各オクターブには128のMIDI楽器が格納される。
- **オクターブ 6**：MIDIキー番号0～127に対応する128のドラムサンプルが格納される。

##### データ構造：
- **楽器データ**：
  - **長さ (int32)**：オーディオファイルのサイズ。
  - **オーディオファイル (nバイト)**：WAV、MP3、OGGなどブラウザが対応する形式のデータ。
- **ドラムサンプルデータ**：
  - **長さ (int32)**：ドラムサンプルのサイズ。
  - **オーディオファイル (nバイト)**：ドラムの音声データ。

##### 使用手順：
1. サウンドバンクはバイナリ形式でシリアル化され、各エントリの先頭に長さが付与される。
2. デコード時には、長さを読み取り、対応するオーディオデータを読み込んで再生する。

#### まとめ：
- **周期波テーブル**は、MIDI 楽器のハーモニクスデータを Base64 でエンコードして格納する。
- **PicoAudio サウンドバンク**は、オクターブ単位で MIDI 楽器とドラムサンプルを整理し、長さ情報を基に音声データにアクセスして再生できる。