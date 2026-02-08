// src/metrics/execution-metrics-writer.ts
import { createJsonlRecorder } from '@/execution/jsonl-recorder.js'
import { ensureDir } from '@/utils/fs.js'
import type { ExecutionMetricsSnapshot } from '@/execution/execution-metrics-collector.js'

export function createExecutionMetricsWriter(file: string) {
    ensureDir(file)
    const write = createJsonlRecorder(file)

    return (input: { ts: number; reason: string; snapshot: ExecutionMetricsSnapshot }) => {
        write(input)
    }
}
