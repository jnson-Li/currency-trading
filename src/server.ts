// Import the framework and instantiate it
console.log('[load] server.ts')
import 'dotenv/config'
import { buildApp } from './app.js'
import { ENV } from './config/env.js'
import { bootstrap } from './system/bootstrap.js'
import { PaperExecutionEngine } from '@/execution/paper-execution-engine.js'
import { createJsonlRecorder } from '@/execution/jsonl-recorder.js'

const write = createJsonlRecorder('./data/paper/ethusdt-paper.jsonl')
const app = await buildApp()

try {
    const executor = new PaperExecutionEngine({
        orderType: 'market', // 先 market 最稳
        maxSlippagePct: 0.0007, // 0.07%
        spreadPct: 0.0004, // 0.04%
        rejectProb: 0.003, // 0.3%
        latencyMs: { min: 80, max: 450 },
        timeoutMs: 1500,

        // qty：用 confidence 映射（你也可以 fixedQty）
        qtyFactor: 0.02,
        minQty: 0.005,
        maxQty: 0.2,

        onResult: (res, signal, ctx) => {
            // 建议落地：result + minimal signal/ctx 摘要（不要写全 ctx）
            write({
                ts: Date.now(),
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

    bootstrap('live', { executor, metricsIntervalMs: 60_000 })

    await app.listen({ port: ENV.PORT })
    console.log('🚀 Server running at http://localhost:3000')
} catch (err) {
    app.log.error(err)
    process.exit(1)
}
