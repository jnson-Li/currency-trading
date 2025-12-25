import { BaseKlineManager } from './base-kline-manager.js'
import { Kline } from '@/types/market.js'

function calcEMA(values: number[], period: number): number | null {
    if (values.length < period) return null
    const k = 2 / (period + 1)
    let ema = values.slice(0, period).reduce((a, b) => a + b) / period
    for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k)
    }
    return ema
}

function calcATR(klines: Kline[], period: number): number | null {
    if (klines.length < period + 1) return null
    const trs: number[] = []
    for (let i = klines.length - period; i < klines.length; i++) {
        const cur = klines[i]
        const prev = klines[i - 1]
        const tr = Math.max(
            cur.high - cur.low,
            Math.abs(cur.high - prev.close),
            Math.abs(cur.low - prev.close)
        )
        trs.push(tr)
    }
    return trs.reduce((a, b) => a + b, 0) / trs.length
}

function findRecentSwing(klines: Kline[], lookback = 3): { high?: number; low?: number } {
    for (let i = klines.length - lookback - 1; i >= lookback; i--) {
        const high = klines[i].high
        const low = klines[i].low
        const window = klines.slice(i - lookback, i + lookback + 1)
        const isHigh = window.every((k) => high >= k.high)
        const isLow = window.every((k) => low <= k.low)
        if (isHigh || isLow) {
            return {
                high: isHigh ? high : undefined,
                low: isLow ? low : undefined,
            }
        }
    }
    return {}
}

export class ETH5mKlineManager extends BaseKlineManager {
    protected readonly SYMBOL = 'ETHUSDT'
    protected readonly INTERVAL = '5m'
    protected readonly HTTP_LIMIT = 200
    protected readonly CACHE_LIMIT = 500
    protected readonly LOG_PREFIX = 'ETH 5m'

    protected emaFast?: number
    protected emaSlow?: number
    protected atr14?: number
    protected lastSwingHigh?: number
    protected lastSwingLow?: number

    protected breakoutSignal = { long: false, short: false }
    protected pullbackSignal = { long: false, short: false }

    protected getExtraSnapshot() {
        return {
            entry: {
                breakout: this.breakoutSignal,
                pullback: this.pullbackSignal,
            },
            atr14: this.atr14,
            emaFast: this.emaFast,
            emaSlow: this.emaSlow,
            swing: {
                high: this.lastSwingHigh,
                low: this.lastSwingLow,
            },
        }
    }

    protected afterAnalysis(k: Kline) {
        // console.log('[ETH 5m closed]', new Date(k.closeTime).toISOString(), k.close)
        this.updateEntrySignals()
    }

    private updateEntrySignals() {
        const closes = this.klines.map((k) => k.close)

        this.emaFast = calcEMA(closes, 9) ?? undefined
        this.emaSlow = calcEMA(closes, 21) ?? undefined
        this.atr14 = calcATR(this.klines, 14) ?? undefined

        // 默认清空
        this.breakoutSignal = { long: false, short: false }
        this.pullbackSignal = { long: false, short: false }

        if (!this.emaFast || !this.emaSlow) return

        const { high, low } = findRecentSwing(this.klines, 3)
        if (high != null) this.lastSwingHigh = high
        if (low != null) this.lastSwingLow = low

        const lastClose = closes[closes.length - 1]

        // ===== 多头信号 =====
        const longBias = this.emaFast > this.emaSlow
        if (longBias && this.lastSwingHigh != null && lastClose > this.lastSwingHigh) {
            this.breakoutSignal.long = true
        }
        if (
            longBias &&
            this.lastSwingLow != null &&
            lastClose > this.emaSlow &&
            lastClose < this.emaFast
        ) {
            this.pullbackSignal.long = true
        }

        // ===== 空头信号（对称）=====
        const shortBias = this.emaFast < this.emaSlow
        if (shortBias && this.lastSwingLow != null && lastClose < this.lastSwingLow) {
            this.breakoutSignal.short = true
        }
        if (
            shortBias &&
            this.lastSwingHigh != null &&
            lastClose < this.emaSlow &&
            lastClose > this.emaFast
        ) {
            this.pullbackSignal.short = true
        }
    }

    public hasBreakoutSignal(side: 'long' | 'short') {
        return this.breakoutSignal[side]
    }

    public hasPullbackSignal(side: 'long' | 'short') {
        return this.pullbackSignal[side]
    }
}
