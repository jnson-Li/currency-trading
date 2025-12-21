// backtest/backtest-runner.ts

import { eth15mManager, eth1hManager, eth4hManager, eth5mManager } from '@/managers/index.js'

import { MultiTimeframeCoordinator } from '@/managers/multi-timeframe-coordinator.js'
import { StrategyEngine } from '@/strategy/strategy-engine.js'
import { BacktestEngine } from '@/backtest/backtest-engine.js'
import type { Kline } from '@/types/market.js'
import type { BacktestConfig } from '@/types/backtest.js'

// 如果你的 Interval 类型在 market.ts 里
import type { Interval } from '@/types/market.js'

/**
 * 回测驱动器：
 * - 不走 init()（避免 HTTP/WS）
 * - 用 feedHistoricalKline 推进各周期状态
 * - 只在 5m 收盘时跑策略
 */
export async function runBacktest(klines5m: Kline[], config: BacktestConfig) {
    // ===== 1️⃣ 构建 Managers（回测不 init）=====
    const m5 = eth5mManager
    const m15 = eth15mManager
    const h1 = eth1hManager
    const h4 = eth4hManager

    // ===== 2️⃣ Coordinator（只管 5m/1h/4h）=====
    const coordinator = new MultiTimeframeCoordinator(m5, h1, h4, {
        symbol: config.symbol,
        staleBars: {
            '5m': 2,
            '1h': 2,
            '4h': 2,
        } satisfies Partial<Record<Interval, number>>,
        allowM5Warning: false,
        allowH1Warning: true,
        allowH4Warning: true,
        // 回测不需要轮询
        pollMs: 0,
    })

    // ⚠️ 回测不建议 coordinator.start()
    // 因为 evaluate() 会直接调用 getTradePermission()
    // coordinator.start?.() 如果你内部实现依赖 timer，可保持不调用即可

    // ===== 3️⃣ Strategy（包含 15m）=====
    const strategy = new StrategyEngine(config.symbol, m5, m15, h1, h4, coordinator)

    // ===== 4️⃣ BacktestEngine =====
    const backtest = new BacktestEngine(config)

    // ===== 5️⃣ 主循环：用 5m 驱动所有周期 =====
    for (const k5 of klines5m) {
        // 推进分析周期（顺序无所谓，保持一致即可）
        h4.feedHistoricalKline(k5)
        h1.feedHistoricalKline(k5)
        m15.feedHistoricalKline(k5)
        m5.feedHistoricalKline(k5)

        // 只在 5m 收盘后执行策略（我们的循环本身就是收盘序列）
        const signal = strategy.evaluate()
        if (signal) {
            backtest.onSignal(signal)
        }

        // 更新持仓：TP/SL 命中检查
        backtest.onNew5mCandle({
            high: k5.high,
            low: k5.low,
            close: k5.close,
            closeTime: k5.closeTime,
        })
    }

    return backtest.getResults()
}
