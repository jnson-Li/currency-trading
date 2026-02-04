import type { Interval } from '@/types/market.js'
import { TradePermission } from './strategy.js'

export interface CoordinatorPermission {
    allowed: boolean
    reasons: string[]
}

export interface CoordinatorState {
    symbol: string
    computedAt?: number

    permission: TradePermission

    lastClosed: Partial<Record<Interval, number>>
}

export interface TriggerPayload {
    interval: '5m'
    time?: number
}
export interface optsConfig {
    symbol: string
    staleBars: Partial<Record<Interval, number>>
    allowM5Warning: boolean
    allowH1Warning: boolean
    allowH4Warning: boolean
}
export interface WsHealthSnapshot {
    ts: number
    symbol: string
    interval: string

    counters: Record<string, number>

    gauges: {
        alive: boolean
        timeHealth: 'healthy' | 'warning' | 'broken'
        lastMessageTs: number | null
        lastCloseTime: number | null
    }
}
