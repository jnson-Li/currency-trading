import { startWsHealthReporter } from './ws-health-reporter.js';
export function registerWsHealthForManagers(managers, opts) {
    const stops = [];
    for (const [name, mgr] of Object.entries(managers)) {
        const stop = startWsHealthReporter(() => mgr.getWsHealthSnapshot(), {
            intervalMs: opts.intervalMs,
            file: `${opts.outputDir}/ws-health-${name}.jsonl`,
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
