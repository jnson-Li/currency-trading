import { BaseKlineManager } from './base-kline-manager.js'
import { Kline } from '@/types/market.js'
import { calcEMA } from '@/utils/ema.js'
import { findSwings } from '@/utils/swing.js'

export class ETH4hKlineManager extends BaseKlineManager {
    protected readonly SYMBOL = 'ETHUSDT'
    protected readonly INTERVAL = '4h'
    protected readonly HTTP_LIMIT = 100
    protected readonly CACHE_LIMIT = 200
    protected readonly LOG_PREFIX = 'ETH 4h'

    protected updateAnalysis() {
        // ===== 趋势：EMA 34（更稳）=====
        const closes = this.getCloses()
        const ema = calcEMA(closes, 34)
        const lastClose = closes[closes.length - 1]

        if (ema) {
            if (lastClose > ema) this.trend = 'bull'
            else if (lastClose < ema) this.trend = 'bear'
            else this.trend = 'range'
        }

        // ===== 结构：Swing lookback 5（过滤噪声）=====
        const { highs, lows } = findSwings(this.klines, 5)

        if (highs.length >= 2 && lows.length >= 2) {
            const h1 = highs[highs.length - 2]
            const h2 = highs[highs.length - 1]
            const l1 = lows[lows.length - 2]
            const l2 = lows[lows.length - 1]

            if (h2 > h1 && l2 > l1) this.structure = 'hh_hl'
            else if (h2 < h1 && l2 < l1) this.structure = 'lh_ll'
            else this.structure = 'range'
        } else {
            this.structure = 'range'
        }
    }

    protected onNewClosedKline(k: Kline) {
        console.log('[ETH 4h closed]', new Date(k.closeTime).toISOString(), k.close)

        // 4h：大级别趋势 / 方向过滤
        // - 是否多头 / 空头结构
        // - 是否震荡
        // - 是否在关键区间
    }
}
