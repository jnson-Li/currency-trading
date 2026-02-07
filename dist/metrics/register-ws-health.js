// src/metrics/register-ws-health.ts
import fs from 'node:fs';
import path from 'node:path';
import { startWsHealthReporter } from './ws-health-reporter.js';
function ensureDir(dir) {
    // recursive: true = mkdir -p
    fs.mkdirSync(dir, { recursive: true });
}
export function registerWsHealthForManagers(managers, opts) {
    const outputDir = path.resolve(opts.outputDir);
    ensureDir(outputDir);
    const stops = [];
    for (const [name, mgr] of Object.entries(managers)) {
        const file = path.join(outputDir, `ws-health-${name}.jsonl`);
        const stop = startWsHealthReporter(() => mgr.getWsHealthSnapshot(), {
            intervalMs: opts.intervalMs,
            file,
        });
        stops.push(stop);
    }
    return {
        stopAll() {
            for (const s of stops)
                s();
        },
    };
}
