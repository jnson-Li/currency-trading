// strategy/types.ts

// types/strategy.ts

import type { KlineSnapshot } from '@/types/market.js'
import type { StrategyContext } from '@/strategy/strategy-context.js'
export type TradeSide = 'long' | 'short'

export interface TradeSignal {
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
export interface TradePermission {
    allowed: boolean
    reason:
        | 'ok'
        | 'not_ready'
        | 'missing_snapshot'
        | '4h_unhealthy'
        | '1h_unhealthy'
        | '5m_unstable'
        | 'stale_data'
        | 'clock_skew'
    detail?: string
}
