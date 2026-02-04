import type { ExecutionResult } from '@/types/execution.js'
import type { TradeSignalBase } from '@/types/strategy.js'
import type { StrategyContext } from '@/strategy/strategy-context.js'
import { LiveExecutionEngine } from './live-execution-engine.js'
import { EXEC_REASON } from '@/execution/execution-reject-reasons.js'
import { PaperExecutionEngine } from './paper-execution-engine.js'

export class ShadowExecutionEngine extends LiveExecutionEngine {
    private readonly paper: PaperExecutionEngine

    constructor(
        riskCfg: ConstructorParameters<typeof LiveExecutionEngine>[0],
        paper: PaperExecutionEngine,
    ) {
        super(riskCfg)
        this.paper = paper
    }

    protected async executeAfterRisk(
        signalId: string,
        signal: TradeSignalBase,
        ctx: StrategyContext,
    ): Promise<ExecutionResult> {
        // 👉 真正执行交给 Paper（影子执行）
        const res = await this.paper.execute(signal, ctx)

        // Paper 已经返回统一 reason（EXECUTED_MARKET / LIMIT / TIMEOUT 等）
        return {
            ...res,
            // signalId 强制统一（避免 paper 自己算的不一致）
            signalId,
        }
    }
}
