// src/metrics/ws-health-collector.ts
export class WsHealthCollector {
    private readonly symbol: string
    private readonly interval: string

    private counters: Record<string, number> = Object.create(null)

    private alive = false
    private lastMessageTs: number | null = null
    private lastCloseTime: number | null = null
    private timeHealth: 'healthy' | 'warning' | 'broken' = 'healthy'

    constructor(symbol: string, interval: string) {
        this.symbol = symbol
        this.interval = interval
    }

    /* ========= counter ========= */

    inc(name: string, n = 1) {
        this.counters[name] = (this.counters[name] ?? 0) + n
    }

    /* ========= state ========= */

    setAlive(v: boolean) {
        this.alive = v
    }

    setLastMessage(ts: number) {
        this.lastMessageTs = ts
    }

    setLastCloseTime(ts: number) {
        this.lastCloseTime = ts
    }

    setTimeHealth(v: 'healthy' | 'warning' | 'broken') {
        this.timeHealth = v
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
        }
    }

    resetCounters() {
        this.counters = Object.create(null)
    }
}
