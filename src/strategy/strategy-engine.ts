// strategy/strategy-engine.ts
import type { TradeSignal, TradeSide } from '@/types/strategy.js'
import type { StrategyContext } from './strategy-context.js'
import { gateHighVolatility, gateTrendExhaustion, gateTrendSwitch } from './gates.js'

export class StrategyEngine {
    evaluate(ctx: StrategyContext): TradeSignal {
        const { permission, h4, h1, m15, m5, symbol, trigger } = ctx

        // ✅ 兼容：如果 Coordinator 已 gate，这里一般 allowed=true
        if (permission?.allowed === false) return null

        // ✅ 只允许 5m close 触发策略（你要的最终形态）
        if (trigger?.interval && trigger.interval !== ('5m' as any)) return null

        // ===== 1) 方向（4h）=====
        const side = this.getDirectionalBias(h4)
        if (!side) return null

        // === ✅ Gate 0: 高波动（用 5m 判最合理）===
        const gVol = gateHighVolatility(m5)
        if (!gVol.pass) return null

        // === ✅ Gate 1: 趋势衰竭（h1/h4）===
        const gExh = gateTrendExhaustion(h4, h1, side)
        if (!gExh.pass) return null

        // === ✅ Gate 2: 切换/冲突/冷却（h4/h1/m15）===
        const gSw = gateTrendSwitch({ h4, h1, m15, side })
        if (!gSw.pass) return null

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
            price: m5?.lastKline?.close ?? 0,
            confidence: entry.confidence,
            reason: entry.reason,
            context: ctx,
            createdAt: Date.now(),
        }
    }

    private getDirectionalBias(s4: any): TradeSide | null {
        if (!s4) return null
        // 做多
        if (s4.trend === 'bull') return 'long'
        // 做空
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
        //上涨结构（多头健康）
        if (side === 'long') return s15.trend === 'bull' && s15.structure === 'hh_hl'
        //下跌结构（空头健康）
        if (side === 'short') return s15.trend === 'bear' && s15.structure === 'lh_ll'
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
            // 顺着空头趋势，在反弹时下手
            if (entry.pullback) return { confidence: 0.72, reason: 'pullback short' }
            // 背向空头趋势，在回拉时下手
            if (entry.breakout) return { confidence: 0.68, reason: 'breakout short' }
        }

        return null
    }
}
