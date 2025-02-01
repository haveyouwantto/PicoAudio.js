import { miniFFT, miniIFFT } from "./dsp";
import AudioUtil from "../../util/audio-util";


export function generatePinkNoise(length) {
    length = AudioUtil.roundPower2(length);
    const re = new Array(length).fill(0).map(() => Math.random() * 2 - 1); 
    const im = new Array(length).fill(0); 

    miniFFT(re, im);
    for (let i = 1; i < length / 2; i++) {
        const scale = Math.sqrt(i); 
        re[i] /= scale;
        im[i] /= scale;
        re[length - i] /= scale;
        im[length - i] /= scale;
    }
    miniIFFT(re, im);

    let max = re.reduce((p, c) => Math.max(p, Math.abs(c)), 0);
    return re.map(v => v / max); 
}