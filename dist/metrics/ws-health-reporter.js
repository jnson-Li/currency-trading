// src/metrics/ws-health-reporter.ts
import fs from 'fs';
export function startWsHealthReporter(snapshotProvider, opts) {
    const { intervalMs, file, logger = console } = opts;
    const timer = setInterval(() => {
        try {
            const snap = snapshotProvider();
            logger.info('[ws-health]', {
                symbol: snap.symbol,
                interval: snap.interval,
                gauges: snap.gauges,
                counters: snap.counters,
            });
            if (file) {
                fs.appendFileSync(file, JSON.stringify(snap) + '\n');
            }
        }
        catch (e) {
            logger.warn('[ws-health] reporter error', e);
        }
    }, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
}
