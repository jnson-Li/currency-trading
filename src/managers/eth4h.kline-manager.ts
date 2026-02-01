import { BaseKlineManager } from './base-kline-manager.js'
import { Kline } from '@/types/market.js'
import { findSwings } from '@/utils/swing.js'
import { calcEMA, calcATR } from '@/utils/ema.js'

type Trend = 'bull' | 'bear' | 'range'
type Structure = 'hh_hl' | 'lh_ll' | 'range'

/**
 * 用 swings 估算最近几段“推进/回调”均值（用于衰竭 gate）
 * - bull: impulse = HL->HH，pullback = HH->HL
 * - bear: impulse = LH->LL，pullback = LL->LH
 */
function calcLegStats(params: {
    highs: number[]
    lows: number[]
    side: 'long' | 'short'
    n?: number
}): { impulseAvg?: number; pullbackAvg?: number } {
    const { highs, lows, side, n = 3 } = params
    const impulseArr: number[] = []
    const pullbackArr: number[] = []

    // 简化：用同长度尾部段落做估算
    // bull: 需要 highs/lows 至少 2n
    // bear: 同理
    const need = Math.max(2, n + 1)
    if (highs.length < need || lows.length < need) return {}

    if (side === 'long') {
        // impulse：l[i] -> h[i]
        // pullback：h[i] -> l[i+1]
        const start = Math.max(0, Math.min(highs.length, lows.length) - (n + 1))
        for (let i = start; i < start + n; i++) {
            const l = lows[i]
            const h = highs[i]
            const lNext = lows[i + 1]
            if (l != null && h != null) impulseArr.push(Math.abs(h - l))
            if (h != null && lNext != null) pullbackArr.push(Math.abs(h - lNext))
        }
    } else {
        // short:
        // impulse：h[i] -> l[i]
        // pullback：l[i] -> h[i+1]
        const start = Math.max(0, Math.min(highs.length, lows.length) - (n + 1))
        for (let i = start; i < start + n; i++) {
            const h = highs[i]
            const l = lows[i]
            const hNext = highs[i + 1]
            if (h != null && l != null) impulseArr.push(Math.abs(h - l))
            if (l != null && hNext != null) pullbackArr.push(Math.abs(l - hNext))
        }
    }

    const avg = (arr: number[]) =>
        arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : undefined

    return {
        impulseAvg: avg(impulseArr),
        pullbackAvg: avg(pullbackArr),
    }
}

export class ETH4hKlineManager extends BaseKlineManager {
    protected readonly SYMBOL = 'ETHUSDT'
    protected readonly INTERVAL = '4h'
    protected readonly HTTP_LIMIT = 100
    protected readonly CACHE_LIMIT = 200
    protected readonly LOG_PREFIX = 'ETH 4h'

    // ===== 状态 =====
    protected trend: Trend = 'range'
    protected structure: Structure = 'range'

    // ===== 指标 =====
    protected ema34?: number
    protected atr14?: number
    protected atrPct?: number

    // ===== 结构关键点 =====
    protected lastHH?: number
    protected lastHL?: number
    protected lastLH?: number
    protected lastLL?: number

    // ===== 切换冷却 =====
    protected lastStructureChangeAt?: number
    protected pendingStructure: Structure = 'range'
    protected pendingCount = 0

    // ===== 衰竭统计 =====
    protected legs?: { impulseAvg?: number; pullbackAvg?: number }

    protected updateAnalysis() {
        if (this.klines.length < 60) return

        this.updateIndicators()
        this.updateTrend()
        this.updateStructureAndLegs()
    }

    /* ================= 指标 ================= */

    private updateIndicators() {
        const closes = this.getCloses()
        const last = this.klines[this.klines.length - 1]
        this.ema34 = calcEMA(closes, 34) ?? undefined
        this.atr14 = calcATR(this.klines, 14) ?? undefined
        this.atrPct = this.atr14 && last?.close ? this.atr14 / last.close : undefined
    }

    /* ================= 趋势（稳态 EMA + buffer） ================= */

    private updateTrend() {
        const closes = this.getCloses()
        const lastClose = closes[closes.length - 1]
        if (!this.ema34 || !lastClose) {
            this.trend = 'range'
            return
        }

        // 4h 更稳：buffer 大一点
        const bufferPct = 0.006 // 0.6%
        const upper = this.ema34 * (1 + bufferPct)
        const lower = this.ema34 * (1 - bufferPct)

        if (lastClose > upper) this.trend = 'bull'
        else if (lastClose < lower) this.trend = 'bear'
        else this.trend = 'range'
    }

    /* ================= 结构（稳态）+ 衰竭 legs ================= */

    private updateStructureAndLegs() {
        const { highs, lows } = findSwings(this.klines, 5)
        console.log('[ ETH 4h structure ] >', { highs, lows })
        if (highs.length < 2 || lows.length < 2) {
            this.applyStableStructure('range')
            this.legs = {}
            return
        }

        const h1 = highs[highs.length - 2]
        const h2 = highs[highs.length - 1]
        const l1 = lows[lows.length - 2]
        const l2 = lows[lows.length - 1]

        let next: Structure = 'range'
        if (h2 > h1 && l2 > l1) {
            next = 'hh_hl'
            this.lastHH = h2
            this.lastHL = l2
        } else if (h2 < h1 && l2 < l1) {
            next = 'lh_ll'
            this.lastLH = h2
            this.lastLL = l2
        } else {
            next = 'range'
        }

        this.applyStableStructure(next)

        // legs：只在有方向时计算
        if (this.structure === 'hh_hl') {
            this.legs = calcLegStats({ highs, lows, side: 'long', n: 3 })
        } else if (this.structure === 'lh_ll') {
            this.legs = calcLegStats({ highs, lows, side: 'short', n: 3 })
        } else {
            this.legs = {}
        }
    }

    private applyStableStructure(next: Structure) {
        const STABLE_N = 2 // 连续2根 4h close 才确认（你可调：2~3）

        if (next !== this.pendingStructure) {
            this.pendingStructure = next
            this.pendingCount = 1
            return
        }

        this.pendingCount += 1
        if (this.pendingCount < STABLE_N) return

        if (next !== this.structure) {
            this.structure = next
            this.lastStructureChangeAt = Date.now()
        }
    }

    /* ================= snapshot ================= */

    protected getExtraSnapshot() {
        return {
            trend: this.trend,
            structure: this.structure,

            ema34: this.ema34,
            atr14: this.atr14,
            atrPct: this.atrPct,

            swing: {
                lastHH: this.lastHH,
                lastHL: this.lastHL,
                lastLH: this.lastLH,
                lastLL: this.lastLL,
            },

            legs: this.legs,

            lastStructureChangeAt: this.lastStructureChangeAt,

            pending: {
                structure: this.pendingStructure,
                count: this.pendingCount,
            },
        }
    }

    protected onNewClosedKline(k: Kline) {
        // console.log('[ETH 4h closed]', new Date(k.closeTime).toISOString(), k.close)
        // 4h：方向过滤 + 衰竭提示（已在 updateAnalysis + snapshot 中产出）
    }
}
