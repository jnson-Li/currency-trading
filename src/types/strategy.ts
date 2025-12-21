// strategy/types.ts

// types/strategy.ts

import type { KlineSnapshot } from '@/types/market.js'

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
    context: {
        h4: KlineSnapshot
        h1: KlineSnapshot
        m15: KlineSnapshot
        m5: KlineSnapshot
    }

    createdAt: number
}
