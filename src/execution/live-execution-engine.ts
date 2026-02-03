import type { ExecutionEngine, ExecutionResult } from '@/types/execution.js'
import type { TradeSignalBase } from '@/types/strategy.js'
import type { StrategyContext } from '@/strategy/strategy-context.js'

type Side = 'long' | 'short'

interface LiveRiskConfig {
    // ===== 频率 / 防抖 =====
    minOrderIntervalMs: number // 同 symbol 最小下单间隔

    // ===== 仓位限制 =====
    maxPositionPct: number // 单 symbol 最大仓位比例（例如 0.2 = 20%）

    // ===== 止血 =====
    maxDailyLossPct: number // 当日最大亏损（例如 0.02 = -2%）
    maxConsecutiveLosses: number // 连续亏损熔断

    // ===== 冷启动 =====
    warmupMs: number // 启动后多久允许交易
}

interface PositionState {
    qty: number
    avgPrice: number
    side: Side
}

export class LiveExecutionEngine implements ExecutionEngine {
    private readonly cfg: LiveRiskConfig
    private readonly startedAt = Date.now()

    // ===== 运行态状态 =====
    private lastOrderAtBySymbol = new Map<string, number>()
    private executedSignalIds = new Set<string>()

    private positionBySymbol = new Map<string, PositionState>()
    private consecutiveLosses = 0
    private dayStartEquity: number | null = null
    private realizedPnlToday = 0

    constructor(cfg: LiveRiskConfig) {
        this.cfg = cfg
    }

    async execute(signal: TradeSignalBase, ctx: StrategyContext): Promise<ExecutionResult> {
        const now = Date.now()
        const symbol = signal.symbol
        const signalId = `${signal.symbol}-${signal.side}-${signal.createdAt}`

        /* =========================
         * 0️⃣ 冷启动保护
         * ========================= */
        if (now - this.startedAt < this.cfg.warmupMs) {
            return this.reject(signalId, 'WARMUP_PERIOD')
        }

        /* =========================
         * 1️⃣ 幂等：同一 signal 只执行一次
         * ========================= */
        if (this.executedSignalIds.has(signalId)) {
            return this.reject(signalId, 'DUPLICATE_SIGNAL')
        }

        /* =========================
         * 2️⃣ 最小下单间隔
         * ========================= */
        const lastOrderAt = this.lastOrderAtBySymbol.get(symbol)
        if (lastOrderAt && now - lastOrderAt < this.cfg.minOrderIntervalMs) {
            return this.reject(signalId, 'ORDER_TOO_FREQUENT', {
                deltaMs: now - lastOrderAt,
            })
        }

        /* =========================
         * 3️⃣ 当日最大亏损
         * ========================= */
        if (this.dayStartEquity != null) {
            const lossPct = -this.realizedPnlToday / this.dayStartEquity
            if (lossPct >= this.cfg.maxDailyLossPct) {
                return this.reject(signalId, 'DAILY_LOSS_LIMIT', { lossPct })
            }
        }

        /* =========================
         * 4️⃣ 连续亏损熔断
         * ========================= */
        if (this.consecutiveLosses >= this.cfg.maxConsecutiveLosses) {
            return this.reject(signalId, 'CONSECUTIVE_LOSS_LIMIT', {
                consecutiveLosses: this.consecutiveLosses,
            })
        }

        /* =========================
         * 5️⃣ 仓位上限检查（极简版）
         * ========================= */
        const pos = this.positionBySymbol.get(symbol)
        if (pos) {
            // 第一版：禁止同方向继续开仓（非常保守）
            if (pos.side === signal.side) {
                return this.reject(signalId, 'POSITION_ALREADY_OPEN', {
                    side: pos.side,
                    qty: pos.qty,
                })
            }
        }

        /* =========================
         * 6️⃣ 真正执行（占位）
         * ========================= */
        try {
            // TODO: 这里以后接 Binance Adapter
            // const exec = await exchange.placeOrder(...)

            // 先模拟一个成功结果（骨架阶段）
            this.executedSignalIds.add(signalId)
            this.lastOrderAtBySymbol.set(symbol, now)

            // ⚠️ 这里你未来要根据真实成交更新 position / pnl
            // 现在先只记录“已执行”
            return {
                signalId,
                accepted: true,
                reason: 'LIVE_ACCEPTED',
            }
        } catch (e) {
            return this.reject(signalId, 'EXECUTION_ERROR', { error: String(e) })
        }
    }

    /* =========================
     * 公共工具
     * ========================= */
    private reject(signalId: string, reason: string, meta?: Record<string, any>): ExecutionResult {
        return {
            signalId,
            accepted: false,
            reason,
            meta,
        }
    }

    /* =========================
     * 生命周期（给 bootstrap.stop 调用）
     * ========================= */
    async stop() {
        // 以后可以在这里：
        // - 断 WS
        // - cancel open orders
        // - 同步最终仓位
    }
}
