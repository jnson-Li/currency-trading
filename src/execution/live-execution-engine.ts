import type { ExecutionEngine, ExecutionResult } from '@/types/execution.js'
import type { TradeSignalBase } from '@/types/strategy.js'
import type { StrategyContext } from '@/strategy/strategy-context.js'
import { EXEC_REASON } from '@/execution/execution-reject-reasons.js'

export interface LiveRiskConfig {
    minOrderIntervalMs: number
    maxPositionPct: number
    maxDailyLossPct: number
    maxConsecutiveLosses: number
    warmupMs: number
}

export class LiveExecutionEngine implements ExecutionEngine {
    protected readonly cfg: LiveRiskConfig
    protected readonly startedAt = Date.now()

    protected lastOrderAtBySymbol = new Map<string, number>()
    protected executedSignalIds = new Set<string>()

    protected consecutiveLosses = 0
    protected realizedPnlToday = 0
    protected dayStartEquity: number | null = null

    constructor(cfg: LiveRiskConfig) {
        this.cfg = cfg
    }

    async execute(signal: TradeSignalBase, ctx: StrategyContext): Promise<ExecutionResult> {
        const now = Date.now()
        const signalId = `SIG:${signal.symbol}:${signal.side}:${ctx.trigger?.closeTime ?? signal.createdAt}`

        /* ========= 0️⃣ 冷启动 ========= */
        if (now - this.startedAt < this.cfg.warmupMs) {
            return this.reject(signalId, EXEC_REASON.WARMUP_PERIOD)
        }

        /* ========= 1️⃣ 幂等 ========= */
        if (this.executedSignalIds.has(signalId)) {
            return this.reject(signalId, EXEC_REASON.ORDER_TOO_FREQUENT)
        }

        /* ========= 2️⃣ 频率 ========= */
        const last = this.lastOrderAtBySymbol.get(signal.symbol)
        if (last && now - last < this.cfg.minOrderIntervalMs) {
            return this.reject(signalId, EXEC_REASON.ORDER_TOO_FREQUENT)
        }

        /* ========= 3️⃣ 当日止损 ========= */
        if (this.dayStartEquity != null) {
            const lossPct = -this.realizedPnlToday / this.dayStartEquity
            if (lossPct >= this.cfg.maxDailyLossPct) {
                return this.reject(signalId, EXEC_REASON.DAILY_LOSS_LIMIT)
            }
        }

        /* ========= 4️⃣ 连亏熔断 ========= */
        if (this.consecutiveLosses >= this.cfg.maxConsecutiveLosses) {
            return this.reject(signalId, EXEC_REASON.CONSECUTIVE_LOSS_LIMIT)
        }

        /* ========= 5️⃣ 通过风控 → 执行 ========= */
        return this.executeAfterRisk(signalId, signal, ctx)
    }

    /** 👉 给 Shadow / Live 重写 */
    protected async executeAfterRisk(
        signalId: string,
        signal: TradeSignalBase,
        ctx: StrategyContext,
    ): Promise<ExecutionResult> {
        throw new Error('executeAfterRisk not implemented')
    }

    protected reject(signalId: string, reason: string): ExecutionResult {
        return {
            signalId,
            accepted: false,
            reason,
        }
    }
}
