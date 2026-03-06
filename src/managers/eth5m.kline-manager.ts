import { BaseKlineManager } from './base-kline-manager.js'
import { Kline, ExecutionSnapshot5m } from '@/types/market.js'
import { calcEMA, calcATR } from '@/utils/ema.js'

/* ================== Utils ================== */

/** 识别 swing high / low（返回 index） */
function detectSwingIndex(
    klines: Kline[],
    lookback = 3,
): { highIndex?: number; lowIndex?: number } {
    for (let i = klines.length - lookback - 1; i >= lookback; i--) {
        const cur = klines[i]
        const window = klines.slice(i - lookback, i + lookback + 1)
        const isHigh = window.every((k) => cur.high >= k.high)
        const isLow = window.every((k) => cur.low <= k.low)
        if (isHigh || isLow) {
            return {
                highIndex: isHigh ? i : undefined,
                lowIndex: isLow ? i : undefined,
            }
        }
    }
    return {}
}

/* ================== Manager ================== */

export class ETH5mKlineManager extends BaseKlineManager<'5m'> {
    constructor() {
        super('ETHUSDT', '5m')
    }
    protected readonly HTTP_LIMIT = 200
    protected readonly CACHE_LIMIT = 500
    protected readonly LOG_PREFIX = 'ETH 5m'

    // indicators
    protected emaFast?: number
    protected emaSlow?: number
    protected atr14?: number
    protected atrPct?: number
    protected atrPctSMA?: number
    protected volSMA?: number

    // swing structure
    protected lastSwingHigh?: number
    protected lastSwingLow?: number

    // entry flags
    protected breakoutSignal = { long: false, short: false }
    protected pullbackSignal = { long: false, short: false }

    protected getExtraSnapshot(): ExecutionSnapshot5m | null {
        if (!this.lastKline) return null
        const last = this.lastKline

        const body = Math.abs(last.close - last.open)
        const range = Math.max(1e-9, last.high - last.low)
        const wickRatio =
            (last.high -
                Math.max(last.open, last.close) +
                (Math.min(last.open, last.close) - last.low)) /
            range

        return {
            emaFast: this.emaFast,
            emaSlow: this.emaSlow,

            atr14: this.atr14,
            atrPct: this.atrPct,
            atrPctSMA: this.atrPctSMA,
            volSMA: this.volSMA,

            wickRatio,

            swing: {
                high: this.lastSwingHigh,
                low: this.lastSwingLow,
            },

            entry: {
                breakout: this.breakoutSignal,
                pullback: this.pullbackSignal,
            },
        }
    }

    protected afterAnalysis(k: Kline) {
        this.updateSignals()
    }

    private calcVolumeSMA(period = 20): number | undefined {
        if (this.klines.length < period) return undefined
        const vols = this.klines.slice(-period).map((k) => k.volume)
        const sum = vols.reduce((a, b) => a + b, 0)
        return sum / vols.length
    }
    private calcAtrPctSMA(period = 20): number | undefined {
        if (this.klines.length < period + 15) return undefined // atr14 需要 warmup
        // 用最近 period 根的 atrPct 做均值
        const arr: number[] = []
        for (let i = this.klines.length - period; i < this.klines.length; i++) {
            const slice = this.klines.slice(0, i + 1)
            const atr = calcATR(slice, 14)
            const close = this.klines[i]?.close
            if (atr != null && close != null && close > 0) arr.push(atr / close)
        }
        if (!arr.length) return undefined
        return arr.reduce((a, b) => a + b, 0) / arr.length
    }
    private updateSignals() {
        if (this.klines.length < 30) return

        const closes = this.klines.map((k) => k.close)
        const last = this.klines[this.klines.length - 1]

        this.emaFast = calcEMA(closes, 9) ?? undefined
        this.emaSlow = calcEMA(closes, 21) ?? undefined
        this.atr14 = calcATR(this.klines, 14) ?? undefined
        this.atrPct = this.atr14 && last.close ? this.atr14 / last.close : undefined

        this.breakoutSignal = { long: false, short: false }
        this.pullbackSignal = { long: false, short: false }

        if (!this.emaFast || !this.emaSlow) return

        // ===== swing detection =====
        const { highIndex, lowIndex } = detectSwingIndex(this.klines, 3)
        if (highIndex != null) this.lastSwingHigh = this.klines[highIndex].high
        if (lowIndex != null) this.lastSwingLow = this.klines[lowIndex].low

        const lastClose = last.close

        // ===== bias =====
        const longBias = this.emaFast > this.emaSlow
        const shortBias = this.emaFast < this.emaSlow
        this.volSMA = this.calcVolumeSMA(20)
        this.atrPctSMA = this.calcAtrPctSMA(20)
        // ===== breakout =====
        if (longBias && this.lastSwingHigh != null && lastClose > this.lastSwingHigh) {
            this.breakoutSignal.long = true
        }
        if (shortBias && this.lastSwingLow != null && lastClose < this.lastSwingLow) {
            this.breakoutSignal.short = true
        }

        // ===== pullback（收紧条件）=====
        if (
            longBias &&
            this.lastSwingLow != null &&
            lastClose > this.lastSwingLow &&
            lastClose < this.emaFast &&
            lastClose > this.emaSlow
        ) {
            this.pullbackSignal.long = true
        }

        if (
            shortBias &&
            this.lastSwingHigh != null &&
            lastClose < this.lastSwingHigh &&
            lastClose > this.emaFast &&
            lastClose < this.emaSlow
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
