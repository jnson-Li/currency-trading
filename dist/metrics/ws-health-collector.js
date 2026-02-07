// src/metrics/ws-health-collector.ts
export class WsHealthCollector {
    symbol;
    interval;
    counters = Object.create(null);
    alive = false;
    lastMessageTs = null;
    lastCloseTime = null;
    timeHealth = 'healthy';
    constructor(symbol, interval) {
        this.symbol = symbol;
        this.interval = interval;
    }
    /* ========= counter ========= */
    inc(name, n = 1) {
        this.counters[name] = (this.counters[name] ?? 0) + n;
    }
    /* ========= state ========= */
    setAlive(v) {
        this.alive = v;
    }
    setLastMessage(ts) {
        this.lastMessageTs = ts;
    }
    setLastCloseTime(ts) {
        this.lastCloseTime = ts;
    }
    setTimeHealth(v) {
        this.timeHealth = v;
    }
    /* ========= snapshot ========= */
    snapshot() {
        return {
            ts: Date.now(),
            symbol: this.symbol,
            interval: this.interval,
            counters: { ...this.counters },
            gauges: {
                alive: this.alive,
                timeHealth: this.timeHealth,
                lastMessageTs: this.lastMessageTs,
                lastCloseTime: this.lastCloseTime,
            },
        };
    }
    resetCounters() {
        this.counters = Object.create(null);
    }
}
