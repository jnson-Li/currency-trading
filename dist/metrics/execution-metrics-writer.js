// src/metrics/execution-metrics-writer.ts
import { createJsonlRecorder } from '../execution/jsonl-recorder.js';
import { ensureDir } from '../utils/fs.js';
export function createExecutionMetricsWriter(file) {
    ensureDir(file);
    const write = createJsonlRecorder(file);
    return (input) => {
        write(input);
    };
}
