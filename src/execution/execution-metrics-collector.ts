// execution/execution-metrics-collector.ts
import type { ExecutionEvent } from './execution-metrics.types.js'
import { ExecRejectReason } from '@/execution/execution-reject-reasons.js'

export type MetricBucket = { count: number; accepted: number; rejected: number }

export interface ExecutionMetricsSnapshot {
    window: { from: number; to: number }
    totals: {
        count: number
        accepted: number
        rejected: number
        acceptanceRate: number
    }

    byReason: Partial<Record<ExecRejectReason, MetricBucket>>

    bySymbol: Record<string, MetricBucket>
}

export interface ExecutionMetricsCollector {
    record(event: ExecutionEvent): void
    snapshot(): ExecutionMetricsSnapshot
    flush(reason?: string): void
    reset(): void
}
