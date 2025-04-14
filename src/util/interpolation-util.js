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
        // xArray: x 坐标数组，需要递增
        // valueArray: 对应 x 坐标的值数组
        // t: 要插值的 x 坐标

        // 检查数组长度是否一致
        if (xArray.length !== valueArray.length) {
            throw new Error("xArray and valueArray must have the same length");
        }

        // 使用二分查找找到 t 所在的区间
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

        // 如果 t 超出 xArray 的范围
        if (index === -1) {
            return valueArray[0];
        }
        if (index === xArray.length - 1) {
            return valueArray[xArray.length - 1];
        }

        // 计算插值比例
        const t0 = (t - xArray[index]) / (xArray[index + 1] - xArray[index]);

        // 进行线性插值
        const result = valueArray[index] + (valueArray[index + 1] - valueArray[index]) * t0;

        return result;
    }
}