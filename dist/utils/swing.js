export function findSwings(klines, lookback) {
    const highs = [];
    const lows = [];
    for (let i = lookback; i < klines.length - lookback; i++) {
        const high = klines[i].high;
        const low = klines[i].low;
        const window = klines.slice(i - lookback, i + lookback + 1);
        if (window.every((k) => high >= k.high))
            highs.push(high);
        if (window.every((k) => low <= k.low))
            lows.push(low);
    }
    return { highs, lows };
}
