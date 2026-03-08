function ensureBucket(map, key) {
    const anyMap = map;
    if (!anyMap[key])
        anyMap[key] = { count: 0, accepted: 0, rejected: 0 };
    return anyMap[key];
}
export class BasicExecutionMetricsCollector {
    events = [];
    windowStart = Date.now();
    record(event) {
        this.events.push(event);
    }
    snapshot() {
        const total = this.events.length;
        let accepted = 0;
        const byReason = {};
        const bySymbol = {};
        for (const e of this.events) {
            if (e.accepted)
                accepted++;
            // ===== reason（强类型）=====
            const r = e.reason;
            const rb = ensureBucket(byReason, r);
            rb.count++;
            e.accepted ? rb.accepted++ : rb.rejected++;
            // ===== symbol（字符串索引 OK）=====
            const sb = bySymbol[e.symbol] ?? (bySymbol[e.symbol] = { count: 0, accepted: 0, rejected: 0 });
            sb.count++;
            e.accepted ? sb.accepted++ : sb.rejected++;
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
        };
    }
    flush(reason = 'manual') {
        const snap = this.snapshot();
        console.log('[exec-metrics][flush]', reason, snap);
        this.reset();
    }
    reset() {
        this.events = [];
        this.windowStart = Date.now();
    }
}
