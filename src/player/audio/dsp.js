
export function miniFFT(re, im) {
    const N = re.length;
    for (let i = 0; i < N; i++) {
        let j = 0;
        for (let h = i, k = N; k >>= 1; h >>= 1) j = (j << 1) | (h & 1);
        if (j > i) {
            [re[i], re[j]] = [re[j], re[i]];
            [im[i], im[j]] = [im[j], im[i]];
        }
    }
    for (let hN = 1; hN * 2 <= N; hN *= 2) {
        for (let i = 0; i < N; i += hN * 2) {
            for (let j = i; j < i + hN; j++) {
                const cos = Math.cos(Math.PI * (j - i) / hN);
                const sin = Math.sin(Math.PI * (j - i) / hN);
                const tre = re[j + hN] * cos + im[j + hN] * sin;
                const tim = -re[j + hN] * sin + im[j + hN] * cos;
                re[j + hN] = re[j] - tre;
                im[j + hN] = im[j] - tim;
                re[j] += tre;
                im[j] += tim;
            }
        }
    }
}

export function miniIFFT(re, im) {
    miniFFT(im, re);
    const N = re.length;
    for (let i = 0; i < N; i++) {
        re[i] /= N;
        im[i] /= N;
    }
}


export default class Waveform {
    constructor(samples, sampleRate) {
        this.samples = samples;
        this.sampleRate = sampleRate;
    }

    // Normalize the waveform to the range [-1, 1]
    norm() {
        const maxAmplitude = this.samples.reduce((p, c) => Math.max(p, Math.abs(c)));
        if (maxAmplitude > 0) {
            this.samples = this.samples.map(sample => sample / maxAmplitude);
        }
        return this;
    }

    // Apply a low-pass filter
    lowPass(cutoff) {
        const RC = 1 / (2 * Math.PI * cutoff);
        const dt = 1 / this.sampleRate;
        const alpha = dt / (RC + dt);

        const filtered = new Array(this.samples.length);
        filtered[0] = 0; // Initialize the first sample

        for (let i = 1; i < this.samples.length; i++) {
            filtered[i] = alpha * this.samples[i] + (1 - alpha) * filtered[i - 1];
        }

        this.samples = filtered;
        return this;
    }

    // Apply a high-pass filter
    highPass(cutoff) {
        const RC = 1 / (2 * Math.PI * cutoff);
        const dt = 1 / this.sampleRate;
        const alpha = RC / (RC + dt);

        const filtered = new Array(this.samples.length);
        filtered[0] = 0; // Initialize the first sample

        for (let i = 1; i < this.samples.length; i++) {
            filtered[i] = alpha * (filtered[i - 1] + this.samples[i] - this.samples[i - 1]);
        }

        this.samples = filtered;
        return this;
    }

    // Generate white noise
    static WhiteNoise(sampleRate, durationInSeconds) {
        const samples = Array.from({ length: sampleRate * durationInSeconds }, () => Math.random() * 2 - 1);
        return new Waveform(samples, sampleRate);
    }
}
