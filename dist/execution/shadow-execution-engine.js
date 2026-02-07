import { LiveExecutionEngine } from './live-execution-engine.js';
export class ShadowExecutionEngine extends LiveExecutionEngine {
    paper;
    constructor(riskCfg, paper) {
        super(riskCfg);
        this.paper = paper;
    }
    async executeAfterRisk(signalId, signal, ctx) {
        // 👉 真正执行交给 Paper（影子执行）
        const res = await this.paper.execute(signal, ctx);
        // Paper 已经返回统一 reason（EXECUTED_MARKET / LIMIT / TIMEOUT 等）
        return {
            ...res,
            // signalId 强制统一（避免 paper 自己算的不一致）
            signalId,
        };
    }
}
