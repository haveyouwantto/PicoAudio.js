/**
 * 補間を提供するクラス
 */
export default class InterpolationUtil {
    /**
     * 波形を線形補間する
     * @param {AudioBuffer} buffer 補間結果を入れるAudioBuffer
     * @param {Array} vtBufs 仮想音源の配列([Float32Array, Float32Array])
     */
    static lerpWave(buffer, vtBufs) {
        // 仮想サンプルレート音源を本番音源に変換する //
        const bufferSize = buffer.getChannelData(0).length;
        const vtBufsSize = vtBufs[0].length;
        if (bufferSize == vtBufsSize) { // 線形補間の必要なし //
            for (let ch = 0; ch < 2; ch++) {
                const data = buffer.getChannelData(ch);
                const vtBuf = vtBufs[ch];
                for (let i = 0; i < bufferSize; i++) {
                    data[i] = vtBuf[i];
                }
            }
        } else { // 線形補間 //
            const ratio = vtBufsSize / bufferSize;
            for (let ch = 0; ch < 2; ch++) {
                const data = buffer.getChannelData(ch);
                const vtBuf = vtBufs[ch];
                for (let i = 0; i < bufferSize; i++) {
                    // 線形補間しながら波形を作成 //
                    // TODO 音がまだ少し違和感あるので、スプライン補正に変更した方がいいかも //
                    const idxF = i * ratio;
                    const idx1 = Math.trunc(idxF);
                    const idx2 = (idx1 + 1) % vtBufsSize;
                    const idxR = idxF - idx1;
                    const w = vtBuf[idx1] * (1 - idxR) + vtBuf[idx2] * idxR;
                    data[i] = w;
                }
            }
        }
    }

    static linearInterp(xArray, valueArray, t) {
        // xArray: Array of x-coordinates, must be monotonically increasing
        // valueArray: Array of corresponding values for x-coordinates
        // t: The x-coordinate to interpolate

        // Check if the array lengths are equal
        if (xArray.length !== valueArray.length) {
            throw new Error("xArray and valueArray must have the same length");
        }

        // Use binary search to find the interval containing t
        let low = 0;
        let high = xArray.length - 1;
        let index = -1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (xArray[mid] <= t) {
                index = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        // If t is out of xArray's range
        if (index === -1) {
            return valueArray[0];
        }
        if (index === xArray.length - 1) {
            return valueArray[xArray.length - 1];
        }

        // Calculate the interpolation ratio
        const t0 = (t - xArray[index]) / (xArray[index + 1] - xArray[index]);

        // Perform linear interpolation
        const result = valueArray[index] + (valueArray[index + 1] - valueArray[index]) * t0;

        return result;
    }
}