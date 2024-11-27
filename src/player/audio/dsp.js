
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


