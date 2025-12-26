// Import the framework and instantiate it
console.log('[load] server.ts')
import 'dotenv/config'
import { buildApp } from './app.js'
import { ENV } from './config/env.js'
import {
    ETH15mKlineManager,
    ETH5mKlineManager,
    ETH1hKlineManager,
    ETH4hKlineManager,
} from '@/managers/index.js'
import { MultiTimeframeCoordinator } from './coordinators/multi-timeframe-coordinator.js'
import { StrategyContextBuilder } from './strategy/strategy-context-builder.js'
import { StrategyEngine } from './strategy/strategy-engine.js'

const app = await buildApp()

const eth5mManager = new ETH5mKlineManager()
const eth15mManager = new ETH15mKlineManager()
const eth1hManager = new ETH1hKlineManager()
const eth4hManager = new ETH4hKlineManager()

const coordinator = new MultiTimeframeCoordinator(eth5mManager, eth1hManager, eth4hManager, {
    symbol: 'ETHUSDT',
    staleBars: { '5m': 2, '1h': 2, '4h': 2 },
    allowM5Warning: false, // 保守：5m warning 也不交易
    allowH1Warning: true, // 1h warning 仍可交易（可按你经验调整）
    allowH4Warning: true, // 4h warning 仍可交易
    pollMs: 1000,
})

const contextBuilder = new StrategyContextBuilder(
    'ETHUSDT',
    eth5mManager,
    eth15mManager,
    eth1hManager,
    eth4hManager
)

const strategyEngine = new StrategyEngine()

coordinator.onStateChange((state) => {
    // ⚠️ 强约束：只在 5m close 后触发
    if (state.snapshots.m5?.level !== 'L1') return

    const ctx = contextBuilder.build(state)
    if (!ctx) return

    const signal = strategyEngine.evaluate(ctx)
    if (!signal) return

    console.log('[TRADE SIGNAL]', signal)
})

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
