import { evaluateSystemHealth } from './evaluate-system-health.js';
import { createJsonlWriter } from './system-health-writer.js';
const writeHealth = createJsonlWriter('./data/metrics/system-health.jsonl');
export function recordSystemHealth(snapshot) {
    const report = evaluateSystemHealth(snapshot);
    writeHealth({
        ts: Date.now(),
        ...report,
    });
    return report;
}
