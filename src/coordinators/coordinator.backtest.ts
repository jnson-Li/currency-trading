import type { Interval, Kline } from '@/types/market.js'
import type { CoordinatorState, ICoordinator } from './coordinator.base.js'

export class BacktestCoordinator implements ICoordinator {
    private closedIntervals: Interval[] = []

    feed5m(kline: Kline) {
        this.closedIntervals = []

        // 5m 永远收盘
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
            permission: {
                allowed: true,
                reason: 'backtest',
            },
        }
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
