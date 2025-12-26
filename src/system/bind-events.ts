import {
    ETH5mKlineManager,
    ETH15mKlineManager,
    ETH1hKlineManager,
    ETH4hKlineManager,
} from '@/managers/index.js'

import { MultiTimeframeCoordinator } from '@/coordinators/multi-timeframe-coordinator.js'

/**
 * 事件绑定层
 * 只负责把「K线 close」事件接到 Coordinator
 * ❌ 不做策略
 * ❌ 不做 mode 判断
 */
export function bindEvents(
    managers: {
        m5: ETH5mKlineManager
        m15: ETH15mKlineManager
        h1: ETH1hKlineManager
        h4: ETH4hKlineManager
    },
    coordinator: MultiTimeframeCoordinator
) {
    managers.m5.onClose((snapshot) => {
        coordinator.onBarClose('5m', snapshot)
    })

    managers.m15.onClose((snapshot) => {
        coordinator.onBarClose('15m', snapshot)
    })

    managers.h1.onClose((snapshot) => {
        coordinator.onBarClose('1h', snapshot)
    })

    managers.h4.onClose((snapshot) => {
        coordinator.onBarClose('4h', snapshot)
    })
}
