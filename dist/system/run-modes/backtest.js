import { HistoricalDataStore } from '../../historical/HistoricalDataStore.js';
import { getLast6MonthsWindow } from '../../backtest/time-window.js';
import { StrategyEngine } from '../../strategy/strategy-engine.js';
/**
 * 回测模式
 * 用 for-loop 重放历史 K 线
 */
export async function startBacktestMode(managers, coordinator) {
    console.log('[backtest] loading historical klines');
    const strategyEngine = new StrategyEngine();
    const { startTime, endTime } = getLast6MonthsWindow();
    const store = new HistoricalDataStore();
    const klines = await store.getKlines('ETHUSDT', '5m', startTime, endTime);
    console.log('[backtest] start feeding klines, count:', klines.length);
    for (const kline of klines) {
        // 这一步会触发：
        // BaseKlineManager → onClose → Coordinator
        managers.m5.feedHistoricalKline(kline);
        managers.m15.feedHistoricalKline(kline);
        managers.h1.feedHistoricalKline(kline);
        managers.h4.feedHistoricalKline(kline);
        const getSnapshot5m = managers.m5.getSnapshot();
        const getSnapshot15m = managers.m15.getSnapshot();
        const getSnapshot1h = managers.h1.getSnapshot();
        const getSnapshot4h = managers.h4.getSnapshot();
        const signal = strategyEngine.evaluate({
            symbol: 'ETHUSDT',
            permission: { allowed: true, reason: 'ok' },
            trigger: {
                interval: '5m',
                closeTime: kline.closeTime,
            },
            // 为了兼容你旧逻辑，直接把常用字段平铺出来（可选）
            m5: getSnapshot5m,
            m15: getSnapshot15m,
            h1: getSnapshot1h,
            h4: getSnapshot4h,
            createdAt: Date.now(),
        });
    }
    console.log('[backtest] backtest finished');
}
