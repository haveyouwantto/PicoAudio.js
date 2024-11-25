import UpdateNote from './play/update-note.js';
import { Number_MAX_SAFE_INTEGER } from '../util/ponyfill.js';

export default function play(isSongLooping) {
    const context = this.context;
    const settings = this.settings;
    const trigger = this.trigger;
    const states = this.states;

    // Chrome Audio Policy 対策 //
    if (context.resume) context.resume();

    // 再生中の場合、処理しない //
    if (states.isPlaying) return;

    // WebMIDIの場合、少し待ってから再生する //
    if (settings.isWebMIDI && !isSongLooping) {
        // Web MIDI API使用時はstop()から800ms程待機すると音がバグりにくい
        if (states.webMIDIWaitState != "completed") {
            if (states.webMIDIWaitState != "waiting") { // play()連打の対策
                // stop()から1000ms後にplay()を実行
                states.webMIDIWaitState = "waiting";
                let waitTime = settings.WebMIDIWaitTime - (context.currentTime - states.webMIDIStopTime) * 1000;
                if (states.webMIDIStopTime == 0) waitTime = settings.WebMIDIWaitTime; // MIDI Portをopenして最初に呼び出すときも少し待つ
                setTimeout(() => {
                    states.webMIDIWaitState = "completed";
                    states.isPlaying = false;
                    this.play();
                }, waitTime);
            }
            return;
        } else {
            states.webMIDIWaitState = null;
        }
    }

    // 変数を用意 //
    const currentTime = context.currentTime;
    this.isPlayed = true;
    states.isPlaying = true;
    states.startTime = !states.startTime && !states.stopTime ? currentTime : (states.startTime + currentTime - states.stopTime);
    states.stopFuncs = [];

    // 冒頭の余白をスキップ //
    if (settings.isSkipBeginning) {
        const firstNoteOnTime = this.firstNoteOnTime;
        if (-states.startTime + currentTime < firstNoteOnTime) {
            this.setStartTime(firstNoteOnTime + states.startTime - currentTime);
        }
    }

    // 曲終了コールバックを予約 //
    let reserveSongEnd;
    const reserveSongEndFunc = () => {
        this.clearFunc("rootTimeout", reserveSongEnd);
        const finishTime = this.getDuration();
        if (finishTime - context.currentTime + states.startTime <= 0) {
            // 予定の時間以降に曲終了
            trigger.songEnd();
            this.onSongEnd();
            this.fireEvent('songEnd');
        } else {
            // 処理落ちしたりしてまだ演奏中の場合、1ms後に曲終了コールバックを呼び出すよう予約
            reserveSongEnd = setTimeout(reserveSongEndFunc, 1);
            this.pushFunc({
                rootTimeout: reserveSongEnd,
                stopFunc: () => { clearTimeout(reserveSongEnd); }
            });
        }
    };
    const finishTime = this.getDuration();
    const reserveSongEndTime = (finishTime - context.currentTime + states.startTime) * 1000;
    reserveSongEnd = setTimeout(reserveSongEndFunc, reserveSongEndTime);
    this.pushFunc({
        rootTimeout: reserveSongEnd,
        stopFunc: () => { clearTimeout(reserveSongEnd); }
    });

    // 再生開始をコールバックに通知 //
    trigger.play();
    this.fireEvent('play');

    // 1ms毎コールバックの準備 //
    UpdateNote.init(this, currentTime);

    // 1ms毎コールバックを開始 //
    const reserve = setInterval(() => {
        UpdateNote.update(this);
    }, 1);
    this.pushFunc({
        rootTimeout: reserve,
        stopFunc: () => { clearInterval(reserve); }
    });
}

export function render(spanDuration = 1) {
    const notes = []
    let index = 0;
    for (let channel of this.playData.channels) {
        for (let note of channel.notes) {
            notes.push(note)
        }
    }
    notes.sort((n1, n2) => n1.start - n2.start)

    const startRender = () => {
        let note = notes[index];
        do {
            note = notes[index];
            if (note) note.channel != 9 ? this.createNote(note) : this.createPercussionNote(note)
            index++;
        } while (index < notes.length && note.startTime - this.context.currentTime <= spanDuration)
    }
    startRender();

    this.context.suspend(spanDuration);

    this.context.onstatechange = (event) => {
        if (this.context.state === 'suspended') {
            startRender()
            this.context.resume()
            this.context.suspend(this.context.currentTime + spanDuration).catch(e => console.warn(e));
        }
    }

    return this.context.startRendering()
}