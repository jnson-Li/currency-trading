// Import the framework and instantiate it
import './config/env.js'
import { buildApp } from './app.js'
import { ENV } from './config/env.js'
import { bootstrap } from './system/bootstrap.js'
import { PaperExecutionEngine } from '@/execution/paper-execution-engine.js'
import { createJsonlRecorder } from '@/execution/jsonl-recorder.js'
// import { LiveExecutionEngine } from '@/execution/live-execution-engine.js'
import { BasicExecutionMetricsCollector } from '@/execution/execution-metrics-collector.impl.js'
import { ShadowExecutionEngine } from '@/execution/shadow-execution-engine.js'

console.log('[ ENV ] >', ENV)
const execMetrics = new BasicExecutionMetricsCollector()

const write = createJsonlRecorder('./data/paper/ethusdt-paper.jsonl')

const app = await buildApp()

let system: { stop: () => Promise<void> } | null = null

try {
    // const executor = new LiveExecutionEngine({
    //     minOrderIntervalMs: 5 * 60 * 1000,
    //     maxPositionPct: 0.2,
    //     maxDailyLossPct: 0.02,
    //     maxConsecutiveLosses: 3,
    //     warmupMs: 2 * 60 * 1000,
    // })
    const paper = new PaperExecutionEngine({
        orderType: 'market',
        maxSlippagePct: 0.0007,
        spreadPct: 0.0004,
        rejectProb: 0.003,
        latencyMs: { min: 80, max: 450 },
        timeoutMs: 1500,

        qtyFactor: 0.02,
        minQty: 0.005,
        maxQty: 0.2,

        onResult: (res, signal, ctx) => {
            const ts = Date.now()

            // 1️⃣ 执行层统一统计（Paper / Live 对齐）
            execMetrics.record({
                ts,
                mode: 'paper',

                signalId: res.signalId,
                symbol: signal.symbol,
                side: signal.side,

                accepted: res.accepted,
                reason: res.reason,

                confidence: signal.confidence,
                price: signal.price,

                meta: {
                    closeTime: ctx.trigger?.closeTime,
                    permissionAllowed: ctx.permission?.allowed,
                },
            })

            // 2️⃣ 详细日志（你原来的）
            write({
                ts,
                res,
                signal: {
                    symbol: signal.symbol,
                    side: signal.side,
                    confidence: signal.confidence,
                    reason: signal.reason,
                    price: signal.price,
                    createdAt: signal.createdAt,
                },
                trigger: ctx.trigger,
                permission: ctx.permission,
            })
        },
    })

    const executor = new ShadowExecutionEngine(
        {
            minOrderIntervalMs: 5 * 60 * 1000,
            maxPositionPct: 0.2,
            maxDailyLossPct: 0.02,
            maxConsecutiveLosses: 3,
            warmupMs: 2 * 60 * 1000,
        },
        paper,
    )

    // ⭐ 关键：await + 接住 stop
    system = await bootstrap('live', {
        executor,
        metricsIntervalMs: 12, // 每 12 次 eval 打一次 metrics（≈1小时）
    })

    await app.listen({ port: ENV.PORT })
    console.log('🚀 Server running at http://localhost:3000')
} catch (err) {
    app.log.error(err)
    process.exit(1)
}

// ===== server 级别兜底 shutdown（非常推荐）=====
const shutdown = async (sig: string) => {
    console.warn(`[server] ${sig} received, shutting down...`)
    try {
        await system?.stop?.()
    } catch (e) {
        console.error('[server] shutdown error:', e)
    } finally {
        process.exit(0)
    }
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
