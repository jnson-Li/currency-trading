import { BaseKlineManager } from './base-kline-manager.js'
import { Kline } from '@/types/market.js'
import { calcEMA } from '@/utils/ema.js'
import { findSwings } from '@/utils/swing.js'

export class ETH15mKlineManager extends BaseKlineManager {
    protected readonly SYMBOL = 'ETHUSDT'
    protected readonly INTERVAL = '15m'
    protected readonly HTTP_LIMIT = 50
    protected readonly CACHE_LIMIT = 200
    protected readonly LOG_PREFIX = 'ETH 15m'

    protected trend: 'bull' | 'bear' | 'range' = 'range'
    protected structure: 'hh_hl' | 'lh_ll' | 'range' = 'range'

    /**
     * 15m 是“分析周期”，不是执行周期
     * 所以：只 override updateAnalysis
     */
    protected updateAnalysis() {
        this.updateTrend()
        this.updateStructure()
    }

    /* ========= 趋势 ========= */

    private updateTrend() {
        const closes = this.klines.map((k) => k.close)
        const ema = calcEMA(closes, 21)
        if (!ema) {
            this.trend = 'range'
            return
        }

        const lastClose = closes[closes.length - 1]

        if (lastClose > ema) this.trend = 'bull'
        else if (lastClose < ema) this.trend = 'bear'
        else this.trend = 'range'
    }

    /* ========= 结构 ========= */

    private updateStructure() {
        const { highs, lows } = findSwings(this.klines, 3)

        if (highs.length < 2 || lows.length < 2) {
            this.structure = 'range'
            return
        }

        const h1 = highs[highs.length - 2]
        const h2 = highs[highs.length - 1]
        const l1 = lows[lows.length - 2]
        const l2 = lows[lows.length - 1]

        if (h2 > h1 && l2 > l1) this.structure = 'hh_hl'
        else if (h2 < h1 && l2 < l1) this.structure = 'lh_ll'
        else this.structure = 'range'
    }

    /* ========= snapshot 扩展 ========= */

    protected getExtraSnapshot() {
        return {
            mid: {
                trend: this.trend,
                structure: this.structure,
            },
        }
    }
}
