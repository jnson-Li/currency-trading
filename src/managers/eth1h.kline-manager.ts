import { BaseKlineManager } from './base-kline-manager.js'
import { Kline } from '@/types/market.js'
import { calcEMA } from '@/utils/ema.js'
import { findSwings } from '@/utils/swing.js'

type Trend = 'bull' | 'bear' | 'range'
type Structure = 'hh_hl' | 'lh_ll' | 'range'

export class ETH1hKlineManager extends BaseKlineManager {
    protected readonly SYMBOL = 'ETHUSDT'
    protected readonly INTERVAL = '1h'
    protected readonly HTTP_LIMIT = 100
    protected readonly CACHE_LIMIT = 300
    protected readonly LOG_PREFIX = 'ETH 1h'

    // ===== 状态 =====
    protected trend: Trend = 'range'
    protected structure: Structure = 'range'

    // ===== 指标 =====
    protected ema21?: number

    // ===== 结构关键点 =====
    protected lastHH?: number
    protected lastHL?: number
    protected lastLH?: number
    protected lastLL?: number

    // ===== 结构切换 =====
    protected lastStructureChangeAt?: number
    protected pendingStructure: Structure = 'range'
    protected pendingCount = 0

    protected updateAnalysis() {
        if (this.klines.length < 30) return

        this.updateTrend()
        this.updateStructure()
    }

    /* ================= 趋势（稳态） ================= */

    private updateTrend() {
        const closes = this.getCloses()
        const lastClose = closes[closes.length - 1]
        this.ema21 = calcEMA(closes, 21) ?? undefined

        if (!this.ema21) {
            this.trend = 'range'
            return
        }

        // ✅ buffer：1h 可以更稳一点
        const bufferPct = 0.003 // 0.3%
        const upper = this.ema21 * (1 + bufferPct)
        const lower = this.ema21 * (1 - bufferPct)

        if (lastClose > upper) this.trend = 'bull'
        else if (lastClose < lower) this.trend = 'bear'
        else this.trend = 'range'
    }

    /* ================= 结构（主结构 + 状态机） ================= */

    private updateStructure() {
        const { highs, lows } = findSwings(this.klines, 3)

        if (highs.length < 2 || lows.length < 2) {
            this.applyStableStructure('range')
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
    }

    private applyStableStructure(next: Structure) {
        const STABLE_N = 2 // 连续 2 根 1h close 才确认

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
            ema21: this.ema21,

            // 结构破坏 / gate 使用
            swing: {
                lastHH: this.lastHH,
                lastHL: this.lastHL,
                lastLH: this.lastLH,
                lastLL: this.lastLL,
            },

            lastStructureChangeAt: this.lastStructureChangeAt,

            // 调试 / 可视化
            pending: {
                structure: this.pendingStructure,
                count: this.pendingCount,
            },
        }
    }

    protected onNewClosedKline(k: Kline) {
        // console.log('[ETH 1h closed]', new Date(k.closeTime).toISOString(), k.close)
        // 主结构在 updateAnalysis 已完成
    }
}
