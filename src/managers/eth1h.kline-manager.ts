import { BaseKlineManager } from './base-kline-manager.js'
import { Kline } from '@/types/market.js'

export class ETH1hKlineManager extends BaseKlineManager {
    protected readonly SYMBOL = 'ETHUSDT'
    protected readonly INTERVAL = '1h'
    protected readonly HTTP_LIMIT = 100
    protected readonly CACHE_LIMIT = 300
    protected readonly LOG_PREFIX = 'ETH 1h'

    protected onNewClosedKline(k: Kline) {
        console.log('[ETH 1h closed]', new Date(k.closeTime).toISOString(), k.close)

        // 1h 趋势 / 结构判断
    }
}
