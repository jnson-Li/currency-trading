// strategy/strategy-engine.ts
import type { TradeSignal, TradeSide } from '@/types/strategy.js'
import type { StrategyContext } from './strategy-context.js'

export class StrategyEngine {
    evaluate(ctx: StrategyContext): TradeSignal | null {
        const { permission, h4, h1, m15, m5, symbol } = ctx

        // ===== 1️⃣ 门禁 =====
        if (!permission.allowed) return null

        // ===== 2️⃣ 方向 =====
        const side = this.getDirectionalBias(h4)
        if (!side) return null

        // ===== 3️⃣ 主结构 =====
        if (!this.confirmStructure(h1, side)) return null

        // ===== 4️⃣ 次级确认 =====
        if (!this.confirmMidframe(m15, side)) return null

        // ===== 5️⃣ 入场 =====
        const entry = this.findEntry(m5, side)
        if (!entry) return null

        return {
            symbol,
            side,
            price: m5.lastClose,
            confidence: entry.confidence,
            reason: entry.reason,
            context: ctx,
            createdAt: Date.now(),
        }
    }

    /* ===== 下面的策略逻辑几乎原封不动 ===== */

    private getDirectionalBias(s4: any): TradeSide | null {
        if (s4.trend === 'bull') return 'long'
        if (s4.trend === 'bear') return 'short'
        return null
    }

    private confirmStructure(s1: any, side: TradeSide): boolean {
        if (side === 'long') return s1.structure === 'hh_hl'
        if (side === 'short') return s1.structure === 'lh_ll'
        return false
    }

    private confirmMidframe(s15: any, side: TradeSide): boolean {
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

    private findEntry(s5: any, side: TradeSide) {
        const entry = s5.entry
        if (!entry) return null

        if (side === 'long') {
            if (entry.pullback) return { confidence: 0.72, reason: 'pullback long' }
            if (entry.breakout) return { confidence: 0.68, reason: 'breakout long' }
        }

        if (side === 'short') {
            if (entry.pullback) return { confidence: 0.72, reason: 'pullback short' }
            if (entry.breakout) return { confidence: 0.68, reason: 'breakout short' }
        }

        return null
    }
}
