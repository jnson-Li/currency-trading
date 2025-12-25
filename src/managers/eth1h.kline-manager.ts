import { BaseKlineManager } from './base-kline-manager.js'
import { Kline } from '@/types/market.js'
import { calcEMA } from '@/utils/ema.js'
import { findSwings } from '@/utils/swing.js'

export class ETH1hKlineManager extends BaseKlineManager {
    protected readonly SYMBOL = 'ETHUSDT'
    protected readonly INTERVAL = '1h'
    protected readonly HTTP_LIMIT = 100
    protected readonly CACHE_LIMIT = 300
    protected readonly LOG_PREFIX = 'ETH 1h'

    protected updateAnalysis() {
        // ===== 趋势：EMA 21 =====
        const closes = this.getCloses()
        const ema = calcEMA(closes, 21)
        const lastClose = closes[closes.length - 1]

        if (ema) {
            if (lastClose > ema) this.trend = 'bull'
            else if (lastClose < ema) this.trend = 'bear'
            else this.trend = 'range'
        }

        // ===== 结构：Swing lookback 3 =====
        const { highs, lows } = findSwings(this.klines, 3)

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
        // console.log('[ETH 1h closed]', new Date(k.closeTime).toISOString(), k.close)
        // 1h 趋势 / 结构判断
    }
}
