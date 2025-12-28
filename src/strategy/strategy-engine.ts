// strategy/strategy-engine.ts
import type { TradeSignal, TradeSide } from '@/types/strategy.js'
import type { StrategyContext } from './strategy-context.js'

export class StrategyEngine {
    evaluate(ctx: StrategyContext): TradeSignal | null {
        const { permission, h4, h1, m15, m5, symbol, trigger } = ctx

        // ✅ 兼容：如果 Coordinator 已 gate，这里一般 allowed=true
        if (permission?.allowed === false) return null

        // ✅ 只允许 5m close 触发策略（你要的最终形态）
        if (trigger?.interval && trigger.interval !== ('5m' as any)) return null

        // ===== 1) 方向（4h）=====
        const side = this.getDirectionalBias(h4)
        if (!side) return null

        // ===== 2) 主结构（1h）=====
        if (!this.confirmStructure(h1, side)) return null

        // ===== 3) 次级确认（15m）=====
        if (!this.confirmMidframe(m15, side)) return null

        // ===== 4) 入场（5m）=====
        const entry = this.findEntry(m5, side)
        if (!entry) return null

        return {
            symbol,
            side,
            price: m5.lastClose ?? m5.lastPrice ?? m5?.kline?.close ?? 0,
            confidence: entry.confidence,
            reason: entry.reason,
            context: ctx,
            createdAt: Date.now(),
        }
    }

    private getDirectionalBias(s4: any): TradeSide | null {
        if (!s4) return null
        if (s4.trend === 'bull') return 'long'
        if (s4.trend === 'bear') return 'short'
        return null
    }

    private confirmStructure(s1: any, side: TradeSide): boolean {
        if (!s1) return false
        if (side === 'long') return s1.structure === 'hh_hl'
        if (side === 'short') return s1.structure === 'lh_ll'
        return false
    }

    private confirmMidframe(s15: any, side: TradeSide): boolean {
        if (!s15) return false
        const mid = s15.mid
        if (!mid) return false

        if (side === 'long') return mid.trend === 'bull' && mid.structure === 'hh_hl'
        if (side === 'short') return mid.trend === 'bear' && mid.structure === 'lh_ll'
        return false
    }

    private findEntry(s5: any, side: TradeSide) {
        if (!s5) return null
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
