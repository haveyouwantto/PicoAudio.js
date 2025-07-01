function fft(real, imag) {
    const N = real.length;
    const resultReal = new Array(N).fill(0);
    const resultImag = new Array(N).fill(0);

    for (let k = 0; k < N; k++) {
        for (let n = 0; n < N; n++) {
            const angle = 2 * Math.PI * k * n / N;
            const cos = Math.cos(angle);
            const sin = -Math.sin(angle);
            resultReal[k] += real[n] * cos - imag[n] * sin;
            resultImag[k] += real[n] * sin + imag[n] * cos;
        }
    }

    return [resultReal, resultImag];
}

function ifft(real, imag) {
    const N = real.length;
    const resultReal = new Array(N).fill(0);
    const resultImag = new Array(N).fill(0);

    for (let k = 0; k < N; k++) {
        for (let n = 0; n < N; n++) {
            const angle = 2 * Math.PI * k * n / N;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle); 
            resultReal[k] += real[n] * cos - imag[n] * sin;
            resultImag[k] += real[n] * sin + imag[n] * cos;
        }
        resultReal[k] /= N;
        resultImag[k] /= N;
    }

    return [resultReal, resultImag];
}

function interp2x(array) {
    const newLength = array.length * 2;
    const newArray = new Float32Array(newLength);
    for (let i = 0; i < array.length; i++) {
        newArray[i * 2] = array[i];
        if (i < array.length - 1) {
            newArray[i * 2 + 1] = (array[i] + array[i + 1]) / 2;
        } else {
            newArray[i * 2 + 1] = array[i];
        }
    }
    return newArray;
}

function interp4x(array) {
    const newLength = array.length * 4;
    const newArray = new Float32Array(newLength);
    for (let i = 0; i < array.length; i++) {
        newArray[i * 4] = array[i];
        if (i < array.length - 1) {
            const startVal = array[i];
            const endVal = array[i + 1];
            const segmentSize = (endVal - startVal) / 4;

            newArray[i * 4 + 1] = startVal + segmentSize * 1; 
            newArray[i * 4 + 2] = startVal + segmentSize * 2; 
            newArray[i * 4 + 3] = startVal + segmentSize * 3; 
        } else {
            newArray[i * 4 + 1] = array[i];
            newArray[i * 4 + 2] = array[i];
            newArray[i * 4 + 3] = array[i];
        }
    }
    return newArray;
}

function interp8x(array) {
    const newLength = array.length * 8;
    const newArray = new Float32Array(newLength);

    for (let i = 0; i < array.length; i++) {
        newArray[i * 8] = array[i]; 

        if (i < array.length - 1) {
            const startVal = array[i];
            const endVal = array[i + 1];
            const segmentSize = (endVal - startVal) / 8;

            for (let j = 1; j < 8; j++) { 
                newArray[i * 8 + j] = startVal + segmentSize * j;
            }
        } else {
            for (let j = 1; j < 8; j++) {
                newArray[i * 8 + j] = array[i];
            }
        }
    }
    return newArray;
}

// Karplus-Strong sampler function
export function ksSampler(amplitudeArray, sampleRate, duration, useDecay, karplusLength = 100) {
    let re = [0];
    let im = [0];

    for (let i = 0; i < amplitudeArray.length; i++) { // 0番目はDC成分として使用しない
        let amp = amplitudeArray[i];
        let phase = Math.random() * 2 * Math.PI; // ランダムな位相
        re.push(amp * Math.cos(phase));
        im.push(amp * Math.sin(phase));
    }

    [re, im] = ifft(re, im);

    // Interpolate the real part
    re = interp8x(re);

    // Normalize the real part
    let maxAmplitude = Math.max(...re.map(Math.abs));
    for (let i = 0; i < re.length; i++) {
        re[i] /= maxAmplitude;
    }

    let sampleCount = Math.floor(sampleRate * duration);
    let audioBuffer = new Float32Array(sampleCount);
    let karplusBuffer = new Float32Array(re.length);

    karplusBuffer.set(re);

    // Remove invalid values (NaN, Infinity)
    for (let i = 0; i < karplusBuffer.length; i++) {
        if (!isFinite(karplusBuffer[i]) || isNaN(karplusBuffer[i])) {
            karplusBuffer[i] = 0;
        }
    }

    if (useDecay) {
        let decay = 0.997;
        let idx = 0;
        for (let i = 0; i < sampleCount; i++) {
            audioBuffer[i] = karplusBuffer[idx];
            // Update the buffer with a simple decay

            let nextIndex = (i + 1) % karplusBuffer.length;
            karplusBuffer[idx] = decay * 0.5 * (karplusBuffer[idx] + karplusBuffer[nextIndex]);
            idx = nextIndex;
        }
    } else {
        for (let i = 0; i < sampleCount; i++) {
            audioBuffer[i] = karplusBuffer[i % karplusBuffer.length];
        }
    }
    return audioBuffer;
}
