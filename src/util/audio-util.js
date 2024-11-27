
export default class AudioUtil {
    static roundPower2(number) {
        if (number <= 0) {
            return 0;
        }
        const power = Math.floor(Math.log2(number)) + 1;
        return 2 ** power;
    }
    
    static fillAudioBuffer(audioBuffer, data) {
        for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
            audioBuffer.copyToChannel(new Float32Array(data), ch);
        }
    }
}