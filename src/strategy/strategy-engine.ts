// strategy/strategy-engine.ts
import type { TradeSignal, TradeSide, TradeSignalBase } from '@/types/strategy.js'
import type { StrategyContext } from './strategy-context.js'
import { gateTrendSwitch, gateHighVolatility, gateTrendExhaustion } from '@/strategy/gates.js'

export type RejectStage =
    | 'permission'
    | 'trigger'
    | 'bias'
    | 'structure_light'
    | 'mid_light'
    | 'gate_trend_switch'
    | 'gate_exhaustion'
    | 'gate_volatility'
    | 'entry'

export interface RejectReason {
    stage: RejectStage
    code: string
    detail?: string
    meta?: any
    at: number
}

export class StrategyEngine {
    /** 最近一次失败原因（方便 bootstrap / backtest 打印/统计） */
    public lastReject: RejectReason | null = null

    evaluate(ctx: StrategyContext): TradeSignal {
        const { permission, h4, h1, m15, m5, symbol, trigger } = ctx

        // 清空上一次 reject（每次 evaluate 都重置）
        this.lastReject = null

        // ✅ 兼容：如果 Coordinator 已 gate，这里一般 allowed=true
        if (permission?.allowed === false) {
            return this.reject('permission', 'PERMISSION_BLOCK', permission)
        }

        // ✅ 只允许 5m close 触发策略
        if (trigger?.interval && trigger.interval !== ('5m' as any)) {
            return this.reject('trigger', 'TRIGGER_NOT_5M', { interval: trigger.interval })
        }

        // ===== 1) 方向（4h）=====
        const side = this.getDirectionalBias(h4)
        if (!side) return this.reject('bias', 'NO_DIRECTIONAL_BIAS', { h4Trend: h4?.trend })

        // ===== 2) 轻结构确认（1h）=====
        // 只否决“明显反向结构”，不要太严格（严格交给 gate）
        if (!this.confirmStructureLight(h1, side)) {
            return this.reject('structure_light', 'H1_STRUCTURE_CONFLICT', {
                side,
                h1Structure: h1?.structure,
            })
        }

        // ===== 3) 轻中周期确认（15m）=====
        // 只否决“明显反向趋势/结构”，其余放行（严格交给 gate）
        if (!this.confirmMidframeLight(m15, side)) {
            return this.reject('mid_light', 'M15_CONFLICT', {
                side,
                m15Trend: m15?.trend,
                m15Structure: m15?.structure,
            })
        }

        // ===== 4) gates：冲突 / 冷却 / 衰竭 / 高波动 =====
        // now 改成 m5 last closeTime（避免 Date.now 导致回测/补数据失真）
        const now = m5?.lastKline?.closeTime ?? Date.now()

        const gSwitch = gateTrendSwitch(ctx, side, now)
        if (!gSwitch.pass) {
            return this.reject('gate_trend_switch', gSwitch.code, { ...gSwitch.meta, now })
        }

        const gExh = gateTrendExhaustion(ctx, side, now)
        if (!gExh.pass) {
            return this.reject('gate_exhaustion', gExh.code, { ...gExh.meta, now })
        }

        const gVol = gateHighVolatility(ctx, now)
        if (!gVol.pass) {
            return this.reject('gate_volatility', gVol.code, { ...gVol.meta, now })
        }

        // ===== 5) 入场（5m）=====
        const entry = this.findEntry(m5, side)
        if (!entry) return this.reject('entry', 'NO_ENTRY', { side })

        const signal: TradeSignal = {
            symbol,
            side,
            price: m5?.lastKline?.close ?? 0,
            confidence: entry.confidence,
            reason: entry.reason,
            context: ctx,
            createdAt: Date.now(),
        }

        // 成功则 lastReject 保持 null
        return signal
    }

    private reject(stage: RejectStage, code: string, meta?: any, detail?: string) {
        this.lastReject = {
            stage,
            code,
            detail,
            meta,
            at: Date.now(),
        }
        return null
    }

    private getDirectionalBias(s4: any): TradeSide | null {
        if (!s4) return null
        if (s4.trend === 'bull') return 'long'
        if (s4.trend === 'bear') return 'short'
        return null
    }

    /**
     * ✅ 轻结构确认：只否决“明显反向”
     * - long：如果 h1.structure 明确是 lh_ll（空头结构） => false
     * - short：如果 h1.structure 明确是 hh_hl（多头结构） => false
     * - range/undefined => 放行（交给 gate 再做严格）
     */
    private confirmStructureLight(h1: any, side: TradeSide): boolean {
        if (!h1) return true // 让 gate 决定是否必须有
        const st = h1.structure
        if (!st) return true

        if (side === 'long') return st !== 'lh_ll'
        if (side === 'short') return st !== 'hh_hl'
        return true
    }

    /**
     * ✅ 轻 15m 确认：只否决“明显反向趋势/结构”
     * - long：m15.trend=bear 或 m15.structure=lh_ll => false
     * - short：m15.trend=bull 或 m15.structure=hh_hl => false
     * - range/undefined => 放行（严格交给 gate）
     */
    private confirmMidframeLight(m15: any, side: TradeSide): boolean {
        if (!m15) return true
        const t = m15.trend
        const st = m15.structure

        if (side === 'long') {
            if (t === 'bear') return false
            if (st === 'lh_ll') return false
            return true
        }

        if (side === 'short') {
            if (t === 'bull') return false
            if (st === 'hh_hl') return false
            return true
        }

        return true
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
