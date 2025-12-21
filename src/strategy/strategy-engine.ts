// strategy/strategy-engine.ts

import type { BaseKlineManager } from '@/managers/base-kline-manager.js'
import type { MultiTimeframeCoordinator } from '@/managers/multi-timeframe-coordinator.js'
import type { TradeSignal, TradeSide } from '@/types/strategy.js'
import type { KlineSnapshot } from '@/types/market.js'

export class StrategyEngine {
    constructor(
        private readonly symbol: string,
        private readonly m5: BaseKlineManager,
        private readonly m15: BaseKlineManager,
        private readonly h1: BaseKlineManager,
        private readonly h4: BaseKlineManager,
        private readonly coordinator: MultiTimeframeCoordinator
    ) {}

    /**
     * ✅ 对外唯一入口
     * 推荐只在 5m 收盘时调用
     */
    evaluate(): TradeSignal | null {
        // ===== 1️⃣ 系统治理（门禁）=====
        const permission = this.coordinator.getTradePermission()
        if (!permission.allowed) return null

        // ===== 2️⃣ 快照（系统唯一可信数据源）=====
        const s5 = this.m5.getSnapshot()
        const s15 = this.m15.getSnapshot()
        const s1 = this.h1.getSnapshot()
        const s4 = this.h4.getSnapshot()

        if (!s5 || !s15 || !s1 || !s4) return null

        // ===== 3️⃣ 战略方向（4h）=====
        const side = this.getDirectionalBias(s4)
        if (!side) return null

        // ===== 4️⃣ 主结构（1h）=====
        if (!this.confirmStructure(s1, side)) return null

        // ===== 5️⃣ 次级确认（15m）=====
        if (!this.confirmMidframe(s15, side)) return null

        // ===== 6️⃣ 执行入场（5m）=====
        const entry = this.findEntry(s5, side)
        if (!entry) return null

        // ===== 7️⃣ 产出强类型 Signal =====
        return {
            symbol: this.symbol,
            side,
            price: s5.lastClose,
            confidence: entry.confidence,
            reason: entry.reason,
            context: {
                h4: s4,
                h1: s1,
                m15: s15,
                m5: s5,
            },
            createdAt: Date.now(),
        }
    }

    /* ======================================================
     *                    策略逻辑区
     * ====================================================== */

    /**
     * 4h：只决定方向，不做入场
     */
    private getDirectionalBias(s4: KlineSnapshot): TradeSide | null {
        if (s4.trend === 'bull') return 'long'
        if (s4.trend === 'bear') return 'short'
        return null
    }

    /**
     * 1h：主结构必须顺势
     */
    private confirmStructure(s1: KlineSnapshot, side: TradeSide): boolean {
        if (side === 'long') return s1.structure === 'hh_hl'
        if (side === 'short') return s1.structure === 'lh_ll'
        return false
    }

    /**
     * 15m：次级结构 / 位置过滤
     */
    private confirmMidframe(s15: KlineSnapshot, side: TradeSide): boolean {
        const mid = s15.mid
        if (!mid) return false

        if (side === 'long') {
            return mid.trend === 'bull' && mid.structure === 'hh_hl'
        }

        if (side === 'short') {
            return mid.trend === 'bear' && mid.structure === 'lh_ll'
        }

        return false
    }

    /**
     * 5m：真正的执行触发
     */
    private findEntry(
        s5: KlineSnapshot,
        side: TradeSide
    ): {
        confidence: number
        reason: string
    } | null {
        const entry = s5.entry
        if (!entry) return null

        if (side === 'long') {
            if (entry.pullback) {
                return {
                    confidence: 0.72,
                    reason: '4h bull + 1h hh_hl + 15m confirm + 5m pullback',
                }
            }

            if (entry.breakout) {
                return {
                    confidence: 0.68,
                    reason: '4h bull + 1h hh_hl + 15m confirm + 5m breakout',
                }
            }
        }

        if (side === 'short') {
            if (entry.pullback) {
                return {
                    confidence: 0.72,
                    reason: '4h bear + 1h lh_ll + 15m confirm + 5m pullback',
                }
            }

            if (entry.breakout) {
                return {
                    confidence: 0.68,
                    reason: '4h bear + 1h lh_ll + 15m confirm + 5m breakout',
                }
            }
        }

        return null
    }
}
