function fft(real, imag) {
    const N = real.length;
    const resultReal = new Array(N).fill(0);
    const resultImag = new Array(N).fill(0);

    for (let k = 0; k < N; k++) {
        for (let n = 0; n < N; n++) {
            const angle = 2 * Math.PI * k * n / N;
            const cos = Math.cos(angle);
            const sin = -Math.sin(angle); // 注意这里是 -sin，用于计算 DFT
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
            const sin = Math.sin(angle); // 注意这里是 +sin，用于计算 IDFT
            resultReal[k] += real[n] * cos - imag[n] * sin;
            resultImag[k] += real[n] * sin + imag[n] * cos;
        }
        resultReal[k] /= N;
        resultImag[k] /= N;
    }

    return [resultReal, resultImag];
}

function resample(inputArray, outLength) {
    const inLength = inputArray.length;
    const ratio = outLength / inLength;
    const outputArray = new Array(outLength);

    // 1. 周期性延拓
    const extendLength = Math.max(4, Math.ceil(inLength * 0.1)); // 延拓长度，可以调整
    const extendedArray = new Array(inLength + 2 * extendLength);
    for (let i = 0; i < extendLength; i++) {
        extendedArray[i] = inputArray[inLength - extendLength + i]; // 头部延拓
        extendedArray[inLength + extendLength + i] = inputArray[i]; // 尾部延拓
    }
    for (let i = 0; i < inLength; i++) {
        extendedArray[extendLength + i] = inputArray[i];
    }

    // 2. 使用 Sinc 插值进行重采样
    for (let i = 0; i < outLength; i++) {
        const floatIndex = i / ratio + extendLength; // 加上延拓长度的偏移
        let intIndex = Math.floor(floatIndex);
        const t = floatIndex - intIndex;

        let value = 0;
        for (let j = -4; j <= 4; j++) { // Sinc 函数的窗口大小，可以调整
            const index = intIndex + j;
            if (index >= 0 && index < extendedArray.length) {
                const sincValue = sinc(t - j);
                value += extendedArray[index] * sincValue;
            }
        }
        outputArray[i] = value;
    }

    return outputArray;

    function sinc(x) {
        if (x === 0) {
            return 1;
        } else {
            return Math.sin(Math.PI * x) / (Math.PI * x);
        }
    }
}

// Karplus-Strong sampler function
export function ksSampler(amplitudeArray, sampleRate, duration, useDecay, karplusLength = 100) {
    let re = new Float32Array(amplitudeArray.length + 1);
    let im = new Float32Array(amplitudeArray.length + 1);

    for (let i = 1; i < amplitudeArray.length; i++) { // 0番目はDC成分として使用しない
        let amp = amplitudeArray[i];
        let phase = Math.random() * 2 * Math.PI; // ランダムな位相
        re[i] = amp * Math.cos(phase);
        im[i] = amp * Math.sin(phase);
    }

    [re, im] = ifft(re, im);

    re = resample(re, karplusLength);

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
        let decay = 1;
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
