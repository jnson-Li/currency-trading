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
import { ExecutionEngine, ExecutionResult } from '@/types/execution.js'
import { RejectStatsFile } from '@/debug/reject-stats-file.js'
// ✅ 你 coordinator 里 onTrigger / onDecisionChange 传出来的就是 StrategyContext
import type { StrategyContext } from '@/strategy/strategy-context.js'
import type { TradeSignal } from '@/types/strategy.js'

export type RunMode = 'live' | 'backtest'

/** ===== 执行引擎插槽：后续 Paper / Shadow / Testnet / Live 都实现这个接口即可 ===== */

class NoopExecutionEngine implements ExecutionEngine {
    async execute(signal: TradeSignal, ctx: StrategyContext): Promise<ExecutionResult> {
        if (!signal) {
            return {
                signalId: 'invalid_signal',
                accepted: false,
                reason: 'INVALID_SIGNAL',
            }
        }
        return {
            signalId: `${signal.symbol}-${signal.side}-${signal.createdAt}`,
            accepted: false,
            reason: 'NOOP_EXECUTOR',
        }
    }
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}

/** 决策变化判断：避免刷屏 */
function decisionKey(ctx: StrategyContext) {
    const p = ctx.permission
    if (!p) return 'no_permission'
    return `${p.allowed ? '1' : '0'}|${p.reason ?? ''}|${p.detail ?? ''}`
}

/**
 * 系统启动入口（按你当前 MultiTimeframeCoordinator 版本改造）
 */
export async function bootstrap(
    mode: RunMode,
    opts?: {
        executor?: ExecutionEngine
        metricsIntervalMs?: number
    },
) {
    console.log('[bootstrap] start with mode:', mode)

    const executor = opts?.executor ?? new NoopExecutionEngine()

    // 1️⃣ 初始化 Kline Managers
    const m5 = new ETH5mKlineManager()
    const m15 = new ETH15mKlineManager()
    const h1 = new ETH1hKlineManager()
    const h4 = new ETH4hKlineManager()

    // 2️⃣ 初始化 Coordinator（你这版：只接受 5m close 触发源）
    const coordinator = new MultiTimeframeCoordinator({
        symbol: 'ETHUSDT',
        staleBars: { '5m': 2, '15m': 2, '1h': 2, '4h': 2 },
        allowM5Warning: false,
        allowH1Warning: true,
        allowH4Warning: true,
        emitDecisionOnlyOnChange: false,
        logger: console,
    })

    // 3️⃣ Strategy
    const strategyEngine = new StrategyEngine()

    // ===== 长期跑必须的：错误边界 + 执行串行化 + 汇总 metrics =====
    const metrics = {
        decisionEvents: 0,
        triggerEvents: 0,
        allowedTriggers: 0,
        blockedTriggers: 0,
        signals: 0,
        execCalls: 0,
        execAccepted: 0,
        execRejected: 0,
        errors: 0,
    }

    const rejectStats = new RejectStatsFile({
        eventFile: './data/reject/reject-events.jsonl',
        summaryFile: './data/reject/reject-summary.jsonl',

        // ✅ 你是 5m 才 evaluate，一小时 12 次
        flushEveryNEvals: 12,

        // ✅ 再加一个兜底：即便长时间无 eval（例如断流）也能定期落汇总
        flushIntervalMs: 60 * 60 * 1000,

        topN: 10,
        samplePerKey: 2,
    })
    rejectStats.start()

    // 执行串行化：避免持仓/下单状态竞争（哪怕 5m 一次 trigger 也建议保留）
    let execChain: Promise<void> = Promise.resolve()

    // 降噪：只在 decision 真变化时打印
    let lastDecisionK: string | null = null

    // ✅ 你 coordinator 的 onDecisionChange 传的是 StrategyContext（每次 5m close 都会 emit）
    coordinator.onDecisionChange((ctx: StrategyContext) => {
        metrics.decisionEvents += 1

        const k = decisionKey(ctx)
        if (k !== lastDecisionK) {
            lastDecisionK = k
            console.info('[decision]', {
                allowed: ctx.permission?.allowed,
                reason: ctx.permission?.reason,
                detail: ctx.permission?.detail,
                closeTime: ctx.trigger?.closeTime,
                lastClosed: ctx.lastClosed,
            })
        }
    })

    // ✅ 你 coordinator 的 onTrigger 也传 StrategyContext（且只在 allowed 时触发）
    coordinator.onTrigger((ctx: StrategyContext) => {
        metrics.triggerEvents += 1
        metrics.allowedTriggers += 1

        // 这里不 await（避免把 coordinator 事件链堵死），但我们把执行串行化
        execChain = execChain
            .then(async () => {
                try {
                    // 额外保险：ctx 是否完整（防未来改动/事件缺失）
                    if (!ctx?.m5?.lastKline) return

                    // === evaluate ===
                    const signal = strategyEngine.evaluate(ctx)

                    if (!signal) {
                        rejectStats.record({
                            signalEmitted: false,
                            reject: strategyEngine.lastReject,
                            meta: {
                                symbol: ctx.symbol,
                                closeTime: ctx.m5?.lastKline?.closeTime,
                            },
                        })
                        return
                    }

                    rejectStats.record({
                        signalEmitted: true,
                        meta: {
                            symbol: ctx.symbol,
                            closeTime: ctx.m5?.lastKline?.closeTime,
                            side: signal.side,
                            confidence: signal.confidence,
                        },
                    })

                    console.log('[signal]', signal)
                    metrics.signals += 1

                    // === 执行（Noop/Paper/Shadow/Testnet/Live）===
                    metrics.execCalls += 1
                    const res = await executor.execute(signal, ctx)
                    if (res.accepted) metrics.execAccepted += 1
                    else metrics.execRejected += 1

                    // 摘要日志：不要 dump 全 ctx
                    console.info('[signal]', {
                        closeTime: ctx.trigger?.closeTime,
                        symbol: signal.symbol,
                        side: signal.side,
                        confidence: signal.confidence,
                        reason: signal.reason,
                        price: signal.price,
                    })
                    console.info('[exec]', res)
                } catch (e) {
                    metrics.errors += 1
                    console.error('[onTrigger] error:', e)
                }
            })
            .catch((e) => {
                // 兜底：保证链不断
                metrics.errors += 1
                console.error('[execChain] error:', e)
            })
    })

    // blockedTriggers 统计：你现在 coordinator 只在 allowed 时 emit trigger，
    // 所以 blockedTriggers 需要从 decision 事件里估算（可选）
    coordinator.onDecisionChange((ctx: StrategyContext) => {
        if (ctx.permission?.allowed === false) metrics.blockedTriggers += 1
    })

    // metrics 定频输出（长期跑必备）
    const metricsInterval = setInterval(() => {
        console.info('[metrics]', {
            ts: new Date().toISOString(),
            mode,
            ...metrics,
        })
    }, opts?.metricsIntervalMs ?? 60_000)

    // 优雅退出
    let stopping = false
    const stop = async () => {
        if (stopping) return
        stopping = true
        rejectStats.flush('manual')
        rejectStats.stop()

        console.warn('[bootstrap] stopping...')
        clearInterval(metricsInterval)

        // 等待执行链收尾（给一个最大等待时间，避免永远卡住）
        const start = Date.now()
        while (true) {
            const done = await Promise.race([
                execChain.then(() => true),
                sleep(200).then(() => false),
            ])
            if (done) break
            if (Date.now() - start > 10_000) break
        }

        console.warn('[bootstrap] stopped')
    }

    const onSig = async (sig: string) => {
        console.warn(`[signal] ${sig}`)
        await stop()
        setTimeout(() => process.exit(0), 200).unref()
    }
    process.once('SIGINT', () => void onSig('SIGINT'))
    process.once('SIGTERM', () => void onSig('SIGTERM'))

    // 4️⃣ 按模式分流
    if (mode === 'live') {
        bindEvents({ m5, m15, h1, h4 }, coordinator)
        await startLiveMode({ m5, m15, h1, h4 })
        return { stop }
    }

    if (mode === 'backtest') {
        await startBacktestMode({ m5, m15, h1, h4 }, coordinator)
        return { stop }
    }

    return { stop }
}
