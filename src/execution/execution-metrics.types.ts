// execution/execution-metrics.types.ts
import type { TradeSignalBase } from '@/types/strategy.js'
import type { StrategyContext } from '@/strategy/strategy-context.js'
import type { ExecutionResult } from '@/types/execution.js'

export interface ExecutionEvent {
    ts: number

    // 核心结果
    accepted: boolean
    reason: string

    // 标识
    signalId: string
    symbol: string
    side: 'long' | 'short'

    // 执行来源
    mode: 'paper' | 'live'

    // 可选补充
    confidence?: number
    price?: number
    latencyMs?: number

    // 上下文（只保留你关心的摘要）
    meta?: {
        closeTime?: number
        permissionAllowed?: boolean
    }
}
