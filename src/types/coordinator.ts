import type { Interval } from '@/types/market.js'

export interface CoordinatorPermission {
    allowed: boolean
    reasons: string[]
}

export interface CoordinatorState {
    symbol: string
    computedAt?: number

    permission: CoordinatorPermission

    lastClosed: Partial<Record<Interval, number>>
}

export interface TriggerPayload {
    interval: '5m'
    time?: number
}
