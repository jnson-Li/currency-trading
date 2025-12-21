import { BaseKlineManager } from './base-kline-manager.js'
import { Kline } from '@/types/market.js'
import { strategy } from '@/server.js'

function calcEMA(values: number[], period: number): number | null {
    if (values.length < period) return null
    const k = 2 / (period + 1)
    let ema = values.slice(0, period).reduce((a, b) => a + b) / period
    for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k)
    }
    return ema
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
    protected lastSwingHigh?: number
    protected lastSwingLow?: number

    protected breakoutSignal = false
    protected pullbackSignal = false

    protected getExtraSnapshot() {
        return {
            entry: {
                breakout: this.breakoutSignal,
                pullback: this.pullbackSignal,
            },
        }
    }

    protected afterAnalysis(k: Kline) {
        console.log('[ETH 5m closed]', new Date(k.closeTime).toISOString(), k.close)

        this.updateEntrySignals()

        const signal = strategy.evaluate()
        if (!signal) return

        console.log('[TRADE SIGNAL]', signal)
    }

    private updateEntrySignals() {
        const closes = this.klines.map((k) => k.close)

        // ===== EMA 快慢线 =====
        this.emaFast = calcEMA(closes, 9) ?? undefined
        this.emaSlow = calcEMA(closes, 21) ?? undefined

        if (!this.emaFast || !this.emaSlow) {
            this.breakoutSignal = false
            this.pullbackSignal = false
            return
        }

        // ===== 最近结构位 =====
        const { high, low } = findRecentSwing(this.klines, 3)
        if (high) this.lastSwingHigh = high
        if (low) this.lastSwingLow = low

        const lastClose = closes[closes.length - 1]

        // ===== 突破型 =====
        this.breakoutSignal =
            this.emaFast > this.emaSlow &&
            this.lastSwingHigh != null &&
            lastClose > this.lastSwingHigh

        // ===== 回踩型 =====
        this.pullbackSignal =
            this.emaFast > this.emaSlow &&
            this.lastSwingLow != null &&
            lastClose > this.emaSlow &&
            lastClose < this.emaFast
    }

    /* ===== 给 StrategyEngine 用的出口 ===== */

    public hasBreakoutSignal() {
        return this.breakoutSignal
    }

    public hasPullbackSignal() {
        return this.pullbackSignal
    }
}
