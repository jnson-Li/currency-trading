// Import the framework and instantiate it
import 'dotenv/config'
import { buildApp } from './app.js'
import { ENV } from './config/env.js'
import { eth15mManager, eth1hManager, eth4hManager, eth5mManager } from '@/managers/index.js'
import { MultiTimeframeCoordinator } from './managers/multi-timeframe-coordinator.js'
import { StrategyEngine } from '@/strategy/strategy-engine.js'

const app = await buildApp()

const coordinator = new MultiTimeframeCoordinator(eth5mManager, eth1hManager, eth4hManager, {
    symbol: 'ETHUSDT',
    staleBars: { '5m': 2, '1h': 2, '4h': 2 },
    allowM5Warning: false, // 保守：5m warning 也不交易
    allowH1Warning: true, // 1h warning 仍可交易（可按你经验调整）
    allowH4Warning: true, // 4h warning 仍可交易
    pollMs: 1000,
})

coordinator.onStateChange((st) => {
    // 给规则引擎 / GPT / 推送用
    console.log('[Coordinator]', st.permission, {
        m5: st.snapshots.m5?.closeTime,
        h1: st.snapshots.h1?.closeTime,
        h4: st.snapshots.h4?.closeTime,
    })
})

export const strategy = new StrategyEngine(
    'ETHUSDT',
    eth5mManager,
    eth15mManager,
    eth1hManager,
    eth4hManager,
    coordinator
)

try {
    await eth5mManager.init()
    await new Promise((r) => setTimeout(r, 500))
    await eth15mManager.init()
    await new Promise((r) => setTimeout(r, 500))
    await eth1hManager.init()
    await new Promise((r) => setTimeout(r, 500))
    await eth4hManager.init()
    coordinator.start()
    await app.listen({ port: ENV.PORT })
    console.log('🚀 Server running at http://localhost:3000')
} catch (err) {
    app.log.error(err)
    process.exit(1)
}
