console.log('[ runBacktest ] >')

import {
    ETH15mKlineManager,
    ETH5mKlineManager,
    ETH1hKlineManager,
    ETH4hKlineManager,
} from '@/managers/index.js'

import { MultiTimeframeCoordinator } from '@/managers/multi-timeframe-coordinator.js'
import { StrategyEngine } from '@/strategy/strategy-engine.js'
import { StrategyContextBuilder } from '@/strategy/strategy-context-builder.js'
import { BacktestEngine } from '@/backtest/backtest-engine.js'

import type { Kline } from '@/types/market.js'
import type { BacktestConfig } from '@/types/backtest.js'
import type { Interval } from '@/types/market.js'

/**
 * 回测驱动器（最终版）：
 * - managers：只 feed，不 init
 * - coordinator：只算 permission / snapshot
 * - contextBuilder：构造 StrategyContext
 * - strategyEngine：纯 evaluate(ctx)
 */
export async function runBacktest(klines5m: Kline[], config: BacktestConfig) {
    // ===== 1️⃣ Managers（回测专用实例）=====
    const m5 = new ETH5mKlineManager()
    const m15 = new ETH15mKlineManager()
    const h1 = new ETH1hKlineManager()
    const h4 = new ETH4hKlineManager()

    // ===== 2️⃣ Coordinator（不 start，不轮询）=====
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
        pollMs: 0,
    })

    // ===== 3️⃣ StrategyContextBuilder（关键）=====
    const contextBuilder = new StrategyContextBuilder(config.symbol, m5, m15, h1, h4)

    // ===== 4️⃣ StrategyEngine（纯决策器）=====
    const strategyEngine = new StrategyEngine()

    // ===== 5️⃣ BacktestEngine =====
    const backtest = new BacktestEngine(config)

    // ===== 6️⃣ 主回测循环（5m 驱动一切）=====
    for (const k5 of klines5m) {
        // 推进各周期（顺序无所谓，但要一致）
        h4.feedHistoricalKline(k5)
        h1.feedHistoricalKline(k5)
        m15.feedHistoricalKline(k5)
        m5.feedHistoricalKline(k5)

        // coordinator 不轮询，手动 recompute
        coordinator.recomputeAndNotify?.()

        const state = coordinator.getState()
        if (!state) continue

        // 只在 5m 收盘后构造 context
        const ctx = contextBuilder.build(state)
        if (!ctx) continue

        const signal = strategyEngine.evaluate(ctx)
        if (signal) {
            backtest.onSignal(signal)
        }

        // 推进持仓（TP / SL）
        backtest.onNew5mCandle({
            high: k5.high,
            low: k5.low,
            close: k5.close,
            closeTime: k5.closeTime,
        })
    }

    return backtest.getResults()
}
