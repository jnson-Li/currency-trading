// utils/ema.ts
import { Kline } from '@/types/market.js'

export function calcEMA(values: number[], period: number): number | null {
    if (values.length < period) return null

    const k = 2 / (period + 1)
    let ema = values.slice(0, period).reduce((a, b) => a + b) / period

    for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k)
    }

    return ema
}
export function calcATR(klines: Kline[], period: number): number | null {
    if (klines.length < period + 1) return null
    let sum = 0
    for (let i = klines.length - period; i < klines.length; i++) {
        const cur = klines[i]
        const prev = klines[i - 1]
        const tr = Math.max(
            cur.high - cur.low,
            Math.abs(cur.high - prev.close),
            Math.abs(cur.low - prev.close),
        )
        sum += tr
    }
    return sum / period
}
