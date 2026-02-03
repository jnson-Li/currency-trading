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
        evalCount: 0,
        executed: 0,
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

    function sleep(ms: number) {
        return new Promise((r) => setTimeout(r, ms))
    }

    /** 串行执行队列：保证所有执行任务按顺序一个个跑，并支持 drain(超时等待收尾) */
    function createSerialQueue() {
        let accepting = true
        let chain: Promise<void> = Promise.resolve()

        return {
            /** stop 之后不再接受新任务 */
            close() {
                accepting = false
            },

            /** 是否还接受新任务 */
            get accepting() {
                return accepting
            },

            /** 串行追加任务（不抛出到外层，保证链不断） */
            enqueue(task: () => Promise<void> | void) {
                if (!accepting) return

                chain = chain
                    .then(async () => {
                        await task()
                    })
                    .catch((e) => {
                        // 吞掉错误，保证后续任务还能继续跑
                        console.error('[serial-queue] task error:', e)
                    })
            },

            /** 等待当前队列跑完（带超时） */
            async drain(timeoutMs = 10_000) {
                // 关键点：stop 之后我们不会再 enqueue，所以 chain 会稳定地收敛
                const done = chain.then(() => true)
                const timeout = sleep(timeoutMs).then(() => false)
                return (await Promise.race([done, timeout])) as boolean
            },
        }
    }

    const queue = createSerialQueue()

    coordinator.onTrigger((ctx: StrategyContext) => {
        // stop 后不再接任务（否则 drain 永远等不完）
        if (!queue.accepting) return

        queue.enqueue(async () => {
            // ✅ 额外保险：ctx 是否完整
            if (!ctx?.m5?.lastKline) return
            metrics.evalCount += 1
            if (metrics.evalCount % 12 === 0) {
                console.log('[metrics]', {
                    evalCount: metrics.evalCount,
                    signals: metrics.signals,
                    executed: metrics.executed,
                    errors: metrics.errors,
                    lastCloseTime: ctx.m5?.lastKline?.closeTime,
                })
            }
            // === evaluate ===
            const signal = strategyEngine.evaluate(ctx)
            if (!signal) {
                rejectStats.record({
                    signalEmitted: false,
                    reject: strategyEngine.lastReject,
                    meta: {
                        symbol: ctx.symbol,
                        closeTime: ctx.m5.lastKline.closeTime,
                    },
                })
                return
            }

            rejectStats.record({
                signalEmitted: true,
                meta: {
                    symbol: ctx.symbol,
                    closeTime: ctx.m5.lastKline.closeTime,
                    side: signal.side,
                    confidence: signal.confidence,
                },
            })

            // === execute（paper/shadow/live）===
            try {
                metrics.signals += 1
                const res: ExecutionResult = await executor.execute(signal, ctx)
                metrics.executed += 1
                // 你想的话可以少量打印
                console.log('[exec]', res)
            } catch (e) {
                metrics.errors += 1
                console.error('[execute] error:', e)
            }
        })
    })

    // blockedTriggers 统计：你现在 coordinator 只在 allowed 时 emit trigger，
    // 所以 blockedTriggers 需要从 decision 事件里估算（可选）
    coordinator.onDecisionChange((ctx: StrategyContext) => {
        if (ctx.permission?.allowed === false) metrics.blockedTriggers += 1
    })

    const metricsTimer = setInterval(
        () => {
            console.log('[heartbeat]', {
                signals: metrics.signals,
                executed: metrics.executed,
                errors: metrics.errors,
            })
        },
        60 * 60 * 1000,
    ) // 1小时
    metricsTimer.unref?.()

    let stopping = false

    const stop = async () => {
        if (stopping) return
        stopping = true

        console.warn('[bootstrap] stopping...')

        // 1) 先停止接受新任务（最关键）
        queue.close()

        // 2) flush 统计（落地文件）
        rejectStats.flush('manual')
        rejectStats.stop()

        // 3) 关闭 metrics 心跳（如果你保留）
        if (metricsTimer) clearInterval(metricsTimer)

        // 4) 等队列收尾（最大等待时间）
        const finished = await queue.drain(10_000)
        if (!finished) {
            console.warn('[bootstrap] stop: drain timeout (10s), force exit soon')
        }

        // 5) 如果 live 模式里有 ws/轮询，最好在这里 stop（看你 startLiveMode 有没有返回 stop）
        // await liveHandle?.stop?.()

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
