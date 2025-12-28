import { ETH5mKlineManager } from '@/managers/index.js'
import { HistoricalDataStore } from '@/historical/HistoricalDataStore.js'
import type { Kline } from '@/types/market.js'
import { getLast6MonthsWindow } from '@/backtest/time-window.js'
import type { BaseKlineManager } from '@/managers/base-kline-manager.js'
import type { Interval } from '@/types/market.js'
import { MultiTimeframeCoordinator } from '@/coordinators/multi-timeframe-coordinator.js'
/**
 * 回测模式
 * 用 for-loop 重放历史 K 线
 */
export async function startBacktestMode(
    managers: Record<Interval, BaseKlineManager>,
    coordinator: MultiTimeframeCoordinator
) {
    console.log('[backtest] loading historical klines')

    const { startTime, endTime } = getLast6MonthsWindow()

    const store = new HistoricalDataStore()

    const klines = await store.getKlines('ETHUSDT', '5m', startTime, endTime)

    console.log('[backtest] start feeding klines, count:', klines.length)

    for (const kline of klines) {
        // 这一步会触发：
        // BaseKlineManager → onClose → Coordinator
        managers['5m'].feedHistoricalKline(kline)
        coordinator.on5mClosed(kline)
    }

    console.log('[backtest] backtest finished')
}
