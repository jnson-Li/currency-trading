import type { Interval, Kline } from '@/types/market.js'
import type { CoordinatorState, ICoordinator, PermissionState } from './coordinator.base.js'

export class LiveCoordinator implements ICoordinator {
    private closedIntervals: Interval[] = []

    // ===== 实盘状态 =====
    private isStable = false
    private lastDecisionTs = 0
    private readonly minDecisionIntervalMs: number

    constructor(options?: { minDecisionIntervalMs?: number }) {
        this.minDecisionIntervalMs = options?.minDecisionIntervalMs ?? 10_000
    }

    /**
     * 由 WS / HTTP 同步层调用
     */
    markStable() {
        this.isStable = true
    }

    markUnstable() {
        this.isStable = false
    }

    feed5m(kline: Kline) {
        this.closedIntervals = []

        this.closedIntervals.push('5m')

        if (this.isClosed(kline.openTime, '15m')) {
            this.closedIntervals.push('15m')
        }
        if (this.isClosed(kline.openTime, '1h')) {
            this.closedIntervals.push('1h')
        }
        if (this.isClosed(kline.openTime, '4h')) {
            this.closedIntervals.push('4h')
        }
    }

    getState(nowTs: number): CoordinatorState {
        return {
            time: nowTs,
            closedIntervals: this.closedIntervals,
            permission: this.computePermission(nowTs),
        }
    }

    // ===== 实盘权限 =====

    private computePermission(nowTs: number): PermissionState {
        if (!this.isStable) {
            return { allowed: false, reason: 'unstable' }
        }

        if (!this.closedIntervals.length) {
            return { allowed: false, reason: 'no-close' }
        }

        if (nowTs - this.lastDecisionTs < this.minDecisionIntervalMs) {
            return { allowed: false, reason: 'cooldown' }
        }

        this.lastDecisionTs = nowTs
        return { allowed: true, reason: 'live-ok' }
    }

    // ===== utils =====

    private isClosed(openTime: number, interval: Interval): boolean {
        const ms = this.intervalToMs(interval)
        return (openTime + ms) % ms === 0
    }

    private intervalToMs(interval: Interval): number {
        switch (interval) {
            case '5m':
                return 5 * 60 * 1000
            case '15m':
                return 15 * 60 * 1000
            case '1h':
                return 60 * 60 * 1000
            case '4h':
                return 4 * 60 * 60 * 1000
            default:
                throw new Error(`Unsupported interval: ${interval}`)
        }
    }
}
