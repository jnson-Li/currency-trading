// strategy/strategy-context.ts
import type { KlineSnapshot } from '@/types/market.js'
import type { TradePermission } from '@/types/strategy.js'

export interface StrategyContext {
    symbol: string
    permission: TradePermission

    h4: KlineSnapshot
    h1: KlineSnapshot
    m15: KlineSnapshot
    m5: KlineSnapshot

    timestamp?: number
    computedAt?: any
}
