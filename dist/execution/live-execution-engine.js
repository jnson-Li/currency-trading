import { EXEC_REASON } from '../execution/execution-reject-reasons.js';
export class LiveExecutionEngine {
    cfg;
    startedAt = Date.now();
    lastOrderAtBySymbol = new Map();
    executedSignalIds = new Set();
    consecutiveLosses = 0;
    realizedPnlToday = 0;
    dayStartEquity = null;
    constructor(cfg) {
        this.cfg = cfg;
    }
    async execute(signal, ctx) {
        const now = Date.now();
        const signalId = `SIG:${signal.symbol}:${signal.side}:${ctx.trigger?.closeTime ?? signal.createdAt}`;
        /* ========= 0️⃣ 冷启动 ========= */
        if (now - this.startedAt < this.cfg.warmupMs) {
            return this.reject(signalId, EXEC_REASON.WARM_UP_PERIOD);
        }
        /* ========= 1️⃣ 幂等 ========= */
        if (this.executedSignalIds.has(signalId)) {
            return this.reject(signalId, EXEC_REASON.ORDER_TOO_FREQUENT);
        }
        /* ========= 2️⃣ 频率限制 ========= */
        const last = this.lastOrderAtBySymbol.get(signal.symbol);
        if (last && now - last < this.cfg.minOrderIntervalMs) {
            return this.reject(signalId, EXEC_REASON.ORDER_TOO_FREQUENT);
        }
        /* ========= 3️⃣ 当日止损 ========= */
        if (this.dayStartEquity != null) {
            const lossPct = -this.realizedPnlToday / this.dayStartEquity;
            if (lossPct >= this.cfg.maxDailyLossPct) {
                return this.reject(signalId, EXEC_REASON.DAILY_LOSS_LIMIT);
            }
        }
        /* ========= 4️⃣ 连亏熔断 ========= */
        if (this.consecutiveLosses >= this.cfg.maxConsecutiveLosses) {
            return this.reject(signalId, EXEC_REASON.CONSECUTIVE_LOSS_LIMIT);
        }
        /* ========= 5️⃣ 风控通过 → 锁定状态 ========= */
        this.executedSignalIds.add(signalId);
        this.lastOrderAtBySymbol.set(signal.symbol, now);
        /* ========= 6️⃣ 真正执行 ========= */
        try {
            const res = await this.executeAfterRisk(signalId, signal, ctx);
            return res;
        }
        catch (e) {
            return this.reject(signalId, EXEC_REASON.EXECUTION_ERROR);
        }
    }
    /** 👉 由 Live / Shadow 重写 */
    async executeAfterRisk(signalId, signal, ctx) {
        throw new Error('executeAfterRisk not implemented');
    }
    reject(signalId, reason) {
        return {
            signalId,
            accepted: false,
            reason,
        };
    }
    /* ========= 可选：实盘统计更新 ========= */
    recordWin() {
        this.consecutiveLosses = 0;
    }
    recordLoss(lossAmount) {
        this.consecutiveLosses++;
        this.realizedPnlToday += lossAmount;
    }
    resetDaily(equity) {
        this.dayStartEquity = equity;
        this.realizedPnlToday = 0;
        this.consecutiveLosses = 0;
    }
}
