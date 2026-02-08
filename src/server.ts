import './config/env.js'
import { buildApp } from './app.js'
import { ENV } from './config/env.js'
import { bootstrap } from './system/bootstrap.js'
import { PaperExecutionEngine } from '@/execution/paper-execution-engine.js'
import { ShadowExecutionEngine } from '@/execution/shadow-execution-engine.js'
import { BasicExecutionMetricsCollector } from '@/execution/execution-metrics-collector.impl.js'
import { createExecutionMetricsWriter } from '@/metrics/execution-metrics-writer.js'
import { createJsonlRecorder } from '@/execution/jsonl-recorder.js'
import { recordSystemHealth } from '@/metrics/system-health-recorder.js'
import { consoleAlert } from '@/metrics/system-health-console.js'
import { telegramAlert } from '@/alert/telegram-health.js'
import { sendTelegram } from '@/alert/telegram.js'

console.log('[ ENV ] >', ENV)
/* =======================
 * Metrics setup
 * ======================= */
const execMetrics = new BasicExecutionMetricsCollector()

const writeExecMetrics = createExecutionMetricsWriter('./data/metrics/execution-metrics.jsonl')
async function checkTelegramHealth() {
    try {
        await sendTelegram(
            ENV.TG_BOT_TOKEN,
            ENV.TG_CHAT_ID,
            `✅ System startup test：${ENV.NODE_ENV} `,
        )
        console.log('[telegram] ok')
    } catch (e) {
        console.error('[telegram] FAILED', e)
    }
}

const METRICS_INTERVAL_MS = 60 * 60 * 1000 // 1h

const metricsTimer = setInterval(async () => {
    const ts = Date.now()

    // 1️⃣ 统一 snapshot（只取一次）
    const snapshot = execMetrics.snapshot()

    // 2️⃣ execution metrics 落盘
    writeExecMetrics({
        ts,
        reason: 'interval',
        snapshot,
    })

    // 3️⃣ system health 评估 + 落盘
    const report = recordSystemHealth(snapshot)
    // 4️⃣ 告警
    consoleAlert(report)
    await telegramAlert(report)

    // 5️⃣ 最后 reset（只 reset 一次）
    execMetrics.reset()
}, METRICS_INTERVAL_MS)

metricsTimer.unref()

/* =======================
 * Paper log
 * ======================= */
const writePaper = createJsonlRecorder('./data/paper/ethusdt-paper.jsonl')

const app = await buildApp()

let system: { stop: () => Promise<void> } | null = null

try {
    checkTelegramHealth()

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

            // ⭐ 1️⃣ execution metrics
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

            // ⭐ 2️⃣ 原始明细
            writePaper({
                ts,
                res,
                signal,
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

    system = await bootstrap('live', {
        executor,
    })

    await app.listen({ port: ENV.PORT })
    console.log('🚀 Server running at http://localhost:3000')
} catch (err) {
    app.log.error(err)
    process.exit(1)
}

/* =======================
 * Graceful shutdown
 * ======================= */
const shutdown = async (sig: string) => {
    console.warn(`[server] ${sig} received, shutting down...`)

    try {
        clearInterval(metricsTimer)

        const ts = Date.now()
        const snapshot = execMetrics.snapshot()

        // ⭐ 最后一笔 execution metrics
        writeExecMetrics({
            ts,
            reason: 'shutdown',
            snapshot,
        })

        // ⭐ 最后一份 system health
        const report = recordSystemHealth(snapshot)
        consoleAlert(report)
        await telegramAlert(report)

        execMetrics.reset()

        await system?.stop?.()
    } catch (e) {
        console.error('[server] shutdown error:', e)
    } finally {
        process.exit(0)
    }
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
