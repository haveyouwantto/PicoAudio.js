export function decodeSF2Sample(sampleData, start, end) {
    const view = new DataView(sampleData);
    const length = end - start;
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const val = view.getInt16((start + i) * 2, true);
        result[i] = val / 32768;
    }
    return result;
}

export default { decodeSF2Sample };
