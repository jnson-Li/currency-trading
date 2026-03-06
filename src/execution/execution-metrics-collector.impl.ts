// src/execution/execution-metrics-collector.impl.ts
import type {
    ExecutionMetricsCollector,
    ExecutionMetricsSnapshot,
    MetricBucket,
} from './execution-metrics-collector.js'
import type { ExecutionEvent } from './execution-metrics.types.js'
import type { ExecRejectReason } from '@/execution/execution-reject-reasons.js'

function ensureBucket<T extends string>(
    map: Partial<Record<T, MetricBucket>> | Record<T, MetricBucket>,
    key: T,
): MetricBucket {
    const anyMap = map as any
    if (!anyMap[key]) anyMap[key] = { count: 0, accepted: 0, rejected: 0 }
    return anyMap[key] as MetricBucket
}

export class BasicExecutionMetricsCollector implements ExecutionMetricsCollector {
    private events: ExecutionEvent[] = []
    private windowStart = Date.now()

    record(event: ExecutionEvent) {
        this.events.push(event)
    }

    snapshot(): ExecutionMetricsSnapshot {
        const total = this.events.length
        let accepted = 0

        const byReason: ExecutionMetricsSnapshot['byReason'] = {}
        const bySymbol: ExecutionMetricsSnapshot['bySymbol'] = {}

        for (const e of this.events) {
            if (e.accepted) accepted++

            // ===== reason（强类型）=====
            const r = e.reason as ExecRejectReason
            const rb = ensureBucket(byReason, r)
            rb.count++
            e.accepted ? rb.accepted++ : rb.rejected++

            // ===== symbol（字符串索引 OK）=====
            const sb =
                bySymbol[e.symbol] ?? (bySymbol[e.symbol] = { count: 0, accepted: 0, rejected: 0 })
            sb.count++
            e.accepted ? sb.accepted++ : sb.rejected++
        }

        return {
            window: { from: this.windowStart, to: Date.now() },
            totals: {
                count: total,
                accepted,
                rejected: total - accepted,
                acceptanceRate: total > 0 ? accepted / total : 0,
            },
            byReason,
            bySymbol,
        }
    }

    flush(reason = 'manual') {
        const snap = this.snapshot()
        console.log('[exec-metrics][flush]', reason, snap)
        this.reset()
    }

    reset() {
        this.events = []
        this.windowStart = Date.now()
    }
}
