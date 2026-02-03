import type {
    ExecutionMetricsCollector,
    ExecutionMetricsSnapshot,
} from './execution-metrics-collector.js'
import type { ExecutionEvent } from './execution-metrics.types.js'

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

            // reason
            if (!byReason[e.reason]) {
                byReason[e.reason] = { count: 0, accepted: 0, rejected: 0 }
            }
            byReason[e.reason].count++
            e.accepted ? byReason[e.reason].accepted++ : byReason[e.reason].rejected++

            // symbol
            if (!bySymbol[e.symbol]) {
                bySymbol[e.symbol] = { count: 0, accepted: 0, rejected: 0 }
            }
            bySymbol[e.symbol].count++
            e.accepted ? bySymbol[e.symbol].accepted++ : bySymbol[e.symbol].rejected++
        }

        return {
            window: {
                from: this.windowStart,
                to: Date.now(),
            },
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
