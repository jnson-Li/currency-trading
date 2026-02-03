// strategy/strategy-context.ts
import type { Interval, KlineSnapshot } from '@/types/market.js'

export type StrategyPermission = {
    allowed: boolean
    reason?: string
    // 你如果有更复杂的 gate 信息也可以加在这里
    warnings?: string[]
    detail?: string
}

export type StrategyTrigger = {
    interval: Interval
    closeTime?: number
    // 可选：如果你要在策略里拿到触发的那根 kline
    kline?: any
}

export type StrategySnapshots = Partial<Record<Interval, any>>

/**
 * StrategyContext：策略引擎的唯一输入
 * - permission：可选（如果 Coordinator 已经 gate 过了，那这里一般 allowed=true）
 * - trigger：建议必有（5m close）
 * - snapshots：各周期分析快照（由 managers 或 coordinator 提供）
 */
export type StrategyContext = {
    symbol: string

    permission: StrategyPermission
    trigger: StrategyTrigger

    // 各周期快照（m5 / m15 / h1 / h4）
    // snapshots: StrategySnapshots

    // 为了兼容你旧逻辑，直接把常用字段平铺出来（可选）
    m5: KlineSnapshot
    m15: KlineSnapshot
    h1: KlineSnapshot
    h4: KlineSnapshot

    createdAt?: number
    meta?: Record<string, any>
    lastClosed?: any
}
