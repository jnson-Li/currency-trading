/**取当前K线左右各3根
如果当前high >= 这7根里面所有high
→ 它是 swing high

如果当前low <= 这7根里面所有low
→ 它是 swing low

趋势拐点
 */
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
