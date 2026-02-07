import type { StrategyContext } from '@/strategy/strategy-context.js'
export type TradeSide = 'long' | 'short'

export interface TradeSignalBase {
    symbol: string
    side: TradeSide

    // === 执行信息 ===
    price: number
    confidence: number

    // === 可读解释 ===
    reason: string

    // === 多周期上下文（完整快照） ===
    context: StrategyContext

    createdAt: number
}

export type TradeSignal = TradeSignalBase | null

export interface TradePermission {
    allowed: boolean
    reason:
        | 'ok'
        | 'not_ready'
        | 'missing_snapshot'
        | '4h_unhealthy'
        | '1h_unhealthy'
        | '5m_unstable'
        | '15m_unhealthy'
        | 'stale_data'
        | 'clock_skew'
        | 'snapshot_is_null'
        | 'no_confirmed_close'
    detail?: string
}
