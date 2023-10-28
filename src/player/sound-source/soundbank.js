import { SimpleSoundFont } from "../../../proto/SimpleSoundFont";

export default class Soundbank {
    constructor(context) {
        this.context = context;
        this.soundbank = {}
        this.loadState = {};
        this.soundbankNames = {};
        this.silent = context.createBuffer(2, 16, context.sampleRate)
        this.simpleSoundfont = null;
    }

    load() {
        fetch('default.sf').then(r => r.ok ? r.arrayBuffer() : null).then(buffer => {
            let simpleSoundfont = SimpleSoundFont.decode(new Uint8Array(buffer));
            console.log(simpleSoundfont)
            for (let i = 0; i < 128; i++) {
                console.log(simpleSoundfont.instruments[i].zones[0].sample.buffer)
                this.context.decodeAudioData(simpleSoundfont.instruments[i].zones[0].sample.buffer).then(audio=>{
                    this.soundbank[i] = audio
                })
            }
        })
    }

    get(instId, pitch = 69, velocity) {
        return this.soundbank[instId]
    }
}