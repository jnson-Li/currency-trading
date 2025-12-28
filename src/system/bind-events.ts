// bind-events.ts
import type { MultiTimeframeCoordinator } from '@/coordinators/multi-timeframe-coordinator.js'
import type {
    ETH5mKlineManager,
    ETH15mKlineManager,
    ETH1hKlineManager,
    ETH4hKlineManager,
} from '@/managers/index.js'

type Managers = {
    m5: ETH5mKlineManager
    m15: ETH15mKlineManager
    h1: ETH1hKlineManager
    h4: ETH4hKlineManager
}

/**
 * 事件绑定（最终版）
 *
 * 设计原则：
 * - 只有 5m close 才能触发决策 / Strategy
 * - 高周期（15m / 1h / 4h）只更新状态，不触发
 * - live / backtest 完全一致
 */
export function bindEvents(managers: Managers, coordinator: MultiTimeframeCoordinator) {
    const { m5, m15, h1, h4 } = managers

    /**
     * ✅ 5m close
     * - 系统的「唯一 Trigger」
     * - 决策 + Strategy 都从这里开始
     */
    m5.onClosedKline((kline) => {
        console.log('[  m5.onClosedKline ] >', kline)
        coordinator.on5mClosed({
            '5m': m5.getSnapshot(),
            '1h': h1.getSnapshot(),
            '4h': h4.getSnapshot(),
            '15m': m15.getSnapshot(),
        })
        // coordinator.on5mClosed(kline)
        // const m15Snt = m15.getSnapshot()
        // const m5Snt = m5.getSnapshot()
        // const h1Snt = h1.getSnapshot()
        // const h4Snt = h4.getSnapshot()
        // console.log('[ m15Snt ] >', m15Snt)
        // console.log('[ m5Snt ] >', m5Snt)
        // console.log('[ h1Snt ] >', h1Snt)
        // console.log('[ h4Snt ] >', h4Snt)
    })

    /**
     * ✅ 15m / 1h / 4h close
     * - 只用于更新多周期状态
     * - 不触发 Strategy
     */
    m15.onClosedKline((kline) => {
        coordinator.onHigherIntervalClosed('15m', kline)
    })

    h1.onClosedKline((kline) => {
        coordinator.onHigherIntervalClosed('1h', kline)
    })

    h4.onClosedKline((kline) => {
        coordinator.onHigherIntervalClosed('4h', kline)
    })
}
