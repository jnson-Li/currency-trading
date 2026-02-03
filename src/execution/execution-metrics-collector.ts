// execution/execution-metrics-collector.ts
import type { ExecutionEvent } from './execution-metrics.types.js'

export interface ExecutionMetricsSnapshot {
    window: {
        from: number
        to: number
    }

    totals: {
        count: number
        accepted: number
        rejected: number
        acceptanceRate: number
    }

    byReason: Record<
        string,
        {
            count: number
            accepted: number
            rejected: number
        }
    >

    bySymbol: Record<
        string,
        {
            count: number
            accepted: number
            rejected: number
        }
    >
}

export interface ExecutionMetricsCollector {
    record(event: ExecutionEvent): void
    snapshot(): ExecutionMetricsSnapshot
    flush(reason?: string): void
    reset(): void
}
