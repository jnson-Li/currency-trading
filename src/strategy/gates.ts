import { KlineSnapshot, Trend } from '@/types/market.js'
type GateResult = { pass: true } | { pass: false; code: string; detail?: any }

const PASS: GateResult = { pass: true }
const FAIL = (code: string, detail?: any): GateResult => ({ pass: false, code, detail })

export function gateHighVolatility(m5: KlineSnapshot): GateResult {
    const k = m5?.lastKline
    const close = k?.close ?? 0
    if (!k || !close) return PASS

    // 1) ATR% 过大：比如 5m ATR 占价格 > 0.9% 就不做（你可调）
    const atrPct = m5.atrPct
    if (atrPct != null && atrPct > 0.009) {
        return FAIL('VOL_ATR_TOO_HIGH', { atrPct })
    }

    // 2) 影线过长：一根针扎太夸张，容易扫损
    const body = Math.abs(k.close - k.open)
    const range = Math.max(1e-9, k.high - k.low)
    const upperWick = k.high - Math.max(k.open, k.close)
    const lowerWick = Math.min(k.open, k.close) - k.low

    // “针”定义：影线占比很高且实体很小（你可调）
    const bodyRatio = body / range
    const wickRatio = (upperWick + lowerWick) / range
    if (bodyRatio < 0.22 && wickRatio > 0.78) {
        return FAIL('VOL_WICK_SPIKE', { bodyRatio, wickRatio })
    }

    // 3) 异常放量：通常对应新闻/强制平仓潮，结构信号极易失真
    if (m5.lastKline.volume != null && m5.volSMA != null && m5.volSMA > 0) {
        const v = m5.lastKline.volume / m5.volSMA
        if (v > 3.2) return FAIL('VOL_VOLUME_SPIKE', { v })
    }

    return PASS
}

export function gateTrendExhaustion(
    h4: KlineSnapshot,
    h1: KlineSnapshot,
    side: 'long' | 'short',
): GateResult {
    const s = h1
    if (!s) return PASS

    // 1) 推进/回调比：推进均值 <= 回调均值 → 趋势很可能衰竭/转震荡
    const impulse = s.legs?.impulseAvg
    const pullback = s.legs?.pullbackAvg
    if (impulse != null && pullback != null && impulse > 0 && pullback > 0) {
        const ratio = impulse / pullback
        // 比如 ratio < 1.05 就当作“推不动”（你可调：1.0~1.3）
        if (ratio < 1.05) {
            return FAIL('EXH_IMPULSE_WEAK', { ratio, impulse, pullback })
        }
    }

    // 2) 回调过深：在多头里，回调接近/跌破关键 HL；空头同理
    const lastHL = s.swing?.lastHL
    const lastLH = s.swing?.lastLH
    const lastClose = s.lastKline?.close ?? 0

    if (side === 'long' && lastHL != null && lastClose) {
        // close 距离 HL 太近（说明结构“摇摇欲坠”）
        const dist = (lastClose - lastHL) / lastClose
        if (dist < 0.0015) {
            // 0.15% 以内，你可调
            return FAIL('EXH_TOO_CLOSE_TO_HL', { dist, lastHL, lastClose })
        }
    }
    if (side === 'short' && lastLH != null && lastClose) {
        const dist = (lastLH - lastClose) / lastClose
        if (dist < 0.0015) {
            return FAIL('EXH_TOO_CLOSE_TO_LH', { dist, lastLH, lastClose })
        }
    }

    // 3) 高周期动能同步衰弱（可选）：如果你有 h4.legs 也可加同样规则
    const h4imp = h4?.legs?.impulseAvg
    const h4pb = h4?.legs?.pullbackAvg
    if (h4imp != null && h4pb != null && h4imp > 0 && h4pb > 0) {
        const h4ratio = h4imp / h4pb
        if (h4ratio < 1.03) {
            return FAIL('EXH_H4_WEAK', { h4ratio, h4imp, h4pb })
        }
    }

    return PASS
}

export function gateTrendSwitch(ctx: {
    h4: KlineSnapshot
    h1: KlineSnapshot
    m15: KlineSnapshot
    side: 'long' | 'short'
}): GateResult {
    const { h4, h1, m15, side } = ctx

    // 1) 多周期冲突：方向相反直接不做
    // 你现在的策略是：4h 定方向，1h/15m 必须顺同方向
    // 这里加一个更严格的冲突判定：任意一个明确反向 → 不做
    const wantTrend: Trend = side === 'long' ? 'bull' : 'bear'
    const opposite: Trend = side === 'long' ? 'bear' : 'bull'

    if (h1?.trend === opposite || m15?.trend === opposite) {
        return FAIL('SWITCH_TREND_CONFLICT', { h1Trend: h1?.trend, m15Trend: m15?.trend })
    }

    // 2) 结构冲突：1h 或 15m 给出了反向结构
    const wantStruct = side === 'long' ? 'hh_hl' : 'lh_ll'
    const oppStruct = side === 'long' ? 'lh_ll' : 'hh_hl'

    if (h1?.structure === oppStruct || m15?.structure === oppStruct) {
        return FAIL('SWITCH_STRUCTURE_CONFLICT', {
            h1Struct: h1?.structure,
            m15Struct: m15?.structure,
        })
    }

    // 3) 冷却期：结构刚变更不交易（例如 1h 结构刚变化 < 2 根 1h K 线）
    // 你可以在结构识别模块里每次结构从 hh_hl -> lh_ll 时写 lastStructureChangeAt
    const now = Date.now()
    const cooldownMs = 2 * 60 * 60 * 1000 // 2h 冷却，你可调：1h~6h

    const h1ChangedAt = h1?.lastStructureChangeAt
    if (h1ChangedAt && now - h1ChangedAt < cooldownMs) {
        return FAIL('SWITCH_COOLDOWN_H1', { minutes: Math.floor((now - h1ChangedAt) / 60000) })
    }

    return PASS
}
