// utils/ema.ts
export function calcEMA(values: number[], period: number): number | null {
    if (values.length < period) return null

    const k = 2 / (period + 1)
    let ema = values.slice(0, period).reduce((a, b) => a + b) / period

    for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k)
    }

    return ema
}
