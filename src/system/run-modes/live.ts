import {
    ETH5mKlineManager,
    ETH15mKlineManager,
    ETH1hKlineManager,
    ETH4hKlineManager,
} from '@/managers/index.js'

/**
 * 实盘模式
 * 只负责：启动真实行情数据源
 */
export async function startLiveMode(managers: {
    m5: ETH5mKlineManager
    m15: ETH15mKlineManager
    h1: ETH1hKlineManager
    h4: ETH4hKlineManager
}) {
    console.log('[live] starting live mode')

    // init() 内部可以是：
    // - HTTP 拉初始 K 线
    // - WS 订阅实时行情
    // - close 时 emit onClose
    await Promise.all([
        managers.m5.init(),
        managers.m15.init(),
        managers.h1.init(),
        managers.h4.init(),
    ])

    console.log('[live] live mode started')
}
