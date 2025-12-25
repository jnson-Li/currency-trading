// strategy/strategy-engine-futures.ts
import type { TradeSignal, TradeSide } from '@/types/strategy.js'
import type { StrategyContext } from '@/strategy/strategy-context.js'

export interface FuturesStrategyParams {
    // 波动过滤（用 5m ATR / close）
    atrPctMin: number
    atrPctMax: number

    // 防止频繁交易：同方向信号冷却（毫秒）
    cooldownMs: number

    // 最低置信度门槛（减少“擦边信号”）
    minConfidence: number
}

export class FuturesStrategyEngine {
    private lastTradeAt = 0

    constructor(private readonly params: FuturesStrategyParams) {}

    evaluate(ctx: StrategyContext): TradeSignal | null {
        const { permission, h4, h1, m5, symbol } = ctx
        if (!permission.allowed) return null

        // ===== 冷却（过拟合保护：避免高频小噪声里反复进出）=====
        if (ctx.computedAt - this.lastTradeAt < this.params.cooldownMs) return null

        // ===== 方向：用 4h 趋势 + 结构（更稳）=====
        const side = this.getDirectionalBias(h4)
        if (!side) return null

        // ===== 结构确认：用 1h 结构（过滤震荡）=====
        if (!this.confirmStructure(h1, side)) return null

        // ===== 波动过滤（过拟合保护）=====
        const atr = m5.atr14
        if (!atr || !m5.lastClose) return null
        const atrPct = atr / m5.lastClose
        if (atrPct < this.params.atrPctMin || atrPct > this.params.atrPctMax) return null

        // ===== 入场：用 5m entry 信号（对称 long/short）=====
        const entry = m5.entry
        if (!entry) return null

        const ok =
            side === 'long'
                ? entry.pullback?.long || entry.breakout?.long
                : entry.pullback?.short || entry.breakout?.short

        if (!ok) return null

        const confidence = entry.pullback ? 0.72 : 0.68

        if (confidence < this.params.minConfidence) return null

        this.lastTradeAt = ctx.computedAt

        return {
            symbol,
            side,
            price: m5.lastClose,
            confidence,
            reason: side === 'long' ? 'mtf long' : 'mtf short',
            context: ctx,
            createdAt: ctx.computedAt, // ✅ 回测不要用 Date.now()
        } as any
    }

    private getDirectionalBias(s4: any): TradeSide | null {
        // 4h 趋势 + 结构
        if (s4.trend === 'bull' && s4.structure === 'hh_hl') return 'long'
        if (s4.trend === 'bear' && s4.structure === 'lh_ll') return 'short'
        return null
    }

    private confirmStructure(s1: any, side: TradeSide): boolean {
        if (side === 'long') return s1.structure === 'hh_hl'
        if (side === 'short') return s1.structure === 'lh_ll'
        return false
    }
}
