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
export type RunMode = 'live' | 'backtest'

/**
 * 系统启动入口
 */
export async function bootstrap(mode: RunMode) {
    console.log('[bootstrap] start with mode:', mode)

    // 1️⃣ 初始化 Kline Managers（中立）
    const m5 = new ETH5mKlineManager()
    const m15 = new ETH15mKlineManager()
    const h1 = new ETH1hKlineManager()
    const h4 = new ETH4hKlineManager()

    // 2️⃣ 初始化 Coordinator（核心 Gate）

    const coordinator = new MultiTimeframeCoordinator(
        { '5m': m5, '1h': h1, '4h': h4, '15m': m15 },

        {
            symbol: 'ETHUSDT',
            staleBars: { '5m': 2, '1h': 2, '4h': 2 },
            allowM5Warning: false, // 保守：5m warning 也不交易
            allowH1Warning: true, // 1h warning 仍可交易（可按你经验调整）
            allowH4Warning: true, // 4h warning 仍可交易
            pollMs: 1000,
        }
    )

    // 3️⃣ 绑定 Coordinator → Strategy（示例）
    coordinator.onStateChange((state) => {
        if (!state.permission.allowed) {
            console.log('[skip]', new Date(state.computedAt).toISOString())
            return
        }

        console.log('[strategy] allowed at', new Date(state.computedAt).toISOString())

        // strategyEngine.evaluate(state)
    })

    // 4️⃣ 事件绑定（非常关键）
    bindEvents({ m5, m15, h1, h4 }, coordinator)

    // 5️⃣ 启动运行模式
    if (mode === 'live') {
        await startLiveMode({ m5, m15, h1, h4 })
    }

    if (mode === 'backtest') {
        await startBacktestMode({ m5 })
    }
}
