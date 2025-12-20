import { BaseKlineManager } from './base-kline-manager.js'
import { Kline } from '@/types/market.js'

export class ETH15mKlineManager extends BaseKlineManager {
    protected readonly SYMBOL = 'ETHUSDT'
    protected readonly INTERVAL = '15m'
    protected readonly HTTP_LIMIT = 50
    protected readonly CACHE_LIMIT = 200
    protected readonly LOG_PREFIX = 'ETH 15m'

    protected onNewClosedKline(k: Kline) {
        console.log('[ETH 15m closed]', new Date(k.closeTime).toISOString(), k.close)

        // 15m 信号计算 / GPT
    }
}
