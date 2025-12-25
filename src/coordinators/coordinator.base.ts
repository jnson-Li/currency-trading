import type { Interval, Kline } from '@/types/market.js'

export interface PermissionState {
    allowed: boolean
    reason?: string
}

export interface CoordinatorState {
    time: number
    closedIntervals: Interval[]
    permission: PermissionState
}

export interface ICoordinator {
    feed5m(kline: Kline): void
    getState(nowTs: number): CoordinatorState
}
