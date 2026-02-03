import type { TradeSignalBase } from '@/types/strategy.js'
import type { StrategyContext } from '@/strategy/strategy-context.js'

export interface ExecutionResult {
    signalId: string
    accepted: boolean
    reason: string

    symbol?: string
    side?: 'long' | 'short'
    orderType?: 'market' | 'limit'
    qty?: number

    marketPrice?: number
    requestedPrice?: number
    filledPrice?: number
    slippagePct?: number
    spreadPct?: number

    openedAt?: number
    latencyMs?: number
    meta?: Record<string, any>
}

export interface ExecutionEngine {
    execute(signal: TradeSignalBase, ctx: StrategyContext): Promise<ExecutionResult>
}

/**
 * PaperExecutionEngine 配置
 */
export interface PaperExecutionConfig {
    /** market / limit，默认 market */
    orderType?: 'market' | 'limit'

    /** 默认用 signal.confidence 估算仓位；也可固定 qty */
    fixedQty?: number
    /** confidence→qty 的放大系数（例如 0.02 表示 confidence=0.7 => qty≈0.014） */
    qtyFactor?: number
    /** 最小/最大 qty（防止异常） */
    minQty?: number
    maxQty?: number

    /** 模拟点差（双边），例如 0.0004=0.04%，会影响成交价（更贴近实盘） */
    spreadPct?: number

    /** 模拟滑点（随机），例如 0.0006=0.06% */
    maxSlippagePct?: number

    /** 模拟下单链路延迟（毫秒），用区间 */
    latencyMs?: { min: number; max: number }

    /** 模拟超时：若 latency > timeoutMs，则视为失败 */
    timeoutMs?: number

    /** 限价策略：距离 marketPrice 的偏移（正数）例如 0.0003=0.03% */
    limitOffsetPct?: number
    /** 限价单允许等待多少 ms 才算“未成交” */
    limitWaitMs?: number

    /** 拒单概率（模拟 API 拒单/风控） */
    rejectProb?: number

    /** 结果落地：可选回调（写文件/写库/统计） */
    onResult?: (res: ExecutionResult, signal: TradeSignalBase, ctx: StrategyContext) => void

    /** 随机数注入（便于回放/测试） */
    rng?: () => number
}
