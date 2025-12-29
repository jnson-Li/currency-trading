import {
    ETH5mKlineManager,
    ETH15mKlineManager,
    ETH1hKlineManager,
    ETH4hKlineManager,
} from '@/managers/index.js'

import { MultiTimeframeCoordinator } from '@/coordinators/multi-timeframe-coordinator.js'
import { bindEvents } from './bind-events.js'
import { startLiveMode } from './run-modes/live.js'
import { startBacktestMode } from './run-modes/backtest.js'
import { StrategyEngine } from '@/strategy/strategy-engine.js'
import { StrategyContextBuilder } from '@/strategy/strategy-context-builder.js'
import { log } from 'console'
export type RunMode = 'live' | 'backtest'

/**
 * 系统启动入口
 */
export async function bootstrap(mode: RunMode) {
    console.log('[bootstrap] start with mode:', mode)

    // 1️⃣ 初始化 Kline Managers
    const m5 = new ETH5mKlineManager()
    const m15 = new ETH15mKlineManager()
    const h1 = new ETH1hKlineManager()
    const h4 = new ETH4hKlineManager()

    // 2️⃣ 初始化 Coordinator（纯事件驱动 / 手动驱动）
    const coordinator = new MultiTimeframeCoordinator({
        symbol: 'ETHUSDT',
        staleBars: { '5m': 2, '1h': 2, '4h': 2 },
        allowM5Warning: false,
        allowH1Warning: true,
        allowH4Warning: true,
    })

    // 3️⃣ Coordinator → Strategy（只订阅 state）
    const contextBuilder = new StrategyContextBuilder('ETHUSDT')
    const strategyEngine = new StrategyEngine()

    // 1️⃣ 监控 / debug / UI
    coordinator.onDecisionChange((decision) => {
        console.info('[decision]', decision)
    })

    coordinator.onTrigger((state) => {
        // state 是 CoordinatorState（trigger 已经发生了）
        console.log('[ state ] >', state)
        const ctx = contextBuilder.build(state)
        console.log('[ ctx ] >', ctx)
        if (!ctx) return
        const signal = strategyEngine.evaluate(ctx)
        console.log('[ 决策结果 ] >', signal)
        // if (signal) backtestOrLiveExecutor.onSignal(signal)
    })

    // 4️⃣ 按模式分流
    if (mode === 'live') {
        // 只有 live 才需要事件绑定
        bindEvents({ m5, m15, h1, h4 }, coordinator)

        await startLiveMode({ m5, m15, h1, h4 })
        return
    }

    if (mode === 'backtest') {
        // 回测：不绑定事件
        await startBacktestMode({ '5m': m5, '15m': m15, '1h': h1, '4h': h4 }, coordinator)
        return
    }
}
