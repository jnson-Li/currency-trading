export const PASS = { pass: true };
export const FAIL = (code, meta) => ({ pass: false, code, meta });
/**
 * gate 1：趋势冲突 / 结构冲突 / 切换冷却
 * ✅ now 必须用 m5.lastKline.closeTime（由 StrategyEngine 传入）
 */
export function gateTrendSwitch(ctx, side, now) {
    const h4 = ctx.h4;
    const h1 = ctx.h1;
    const m15 = ctx.m15;
    // 1) 方向冲突（4h）
    if (side === 'long' && h4?.trend === 'bear')
        return FAIL('SWITCH_H4_CONFLICT', { h4Trend: h4?.trend });
    if (side === 'short' && h4?.trend === 'bull')
        return FAIL('SWITCH_H4_CONFLICT', { h4Trend: h4?.trend });
    // 2) 结构冲突（1h）
    // 这里可以比 “轻确认”更严格一点（你要的：把严格留在 gate）
    if (side === 'long' && h1?.structure === 'lh_ll')
        return FAIL('SWITCH_H1_STRUCTURE_CONFLICT', { h1Structure: h1?.structure });
    if (side === 'short' && h1?.structure === 'hh_hl')
        return FAIL('SWITCH_H1_STRUCTURE_CONFLICT', { h1Structure: h1?.structure });
    // 3) 15m 冲突（可选更严格）
    if (side === 'long') {
        if (m15?.trend === 'bear')
            return FAIL('SWITCH_M15_TREND_CONFLICT', { m15Trend: m15?.trend });
        if (m15?.structure === 'lh_ll')
            return FAIL('SWITCH_M15_STRUCTURE_CONFLICT', { m15Structure: m15?.structure });
    }
    else {
        if (m15?.trend === 'bull')
            return FAIL('SWITCH_M15_TREND_CONFLICT', { m15Trend: m15?.trend });
        if (m15?.structure === 'hh_hl')
            return FAIL('SWITCH_M15_STRUCTURE_CONFLICT', { m15Structure: m15?.structure });
    }
    // 4) 冷却：结构刚切换的一段时间不做
    // 你之前用 Date.now()，这里统一改为 now（m5 closeTime）
    const cooldownMs = 30 * 60 * 1000; // 30min（你可调）
    const h1ChangedAt = (h1?.lastStructureChangeAt ?? null);
    if (h1ChangedAt != null && now - h1ChangedAt < cooldownMs) {
        return FAIL('SWITCH_COOLDOWN_H1', { h1ChangedAt, cooldownMs, deltaMs: now - h1ChangedAt });
    }
    const m15ChangedAt = (m15?.lastStructureChangeAt ?? null);
    if (m15ChangedAt != null && now - m15ChangedAt < Math.min(cooldownMs, 15 * 60 * 1000)) {
        return FAIL('SWITCH_COOLDOWN_M15', {
            m15ChangedAt,
            cooldownMs,
            deltaMs: now - m15ChangedAt,
        });
    }
    return PASS;
}
/**
 * gate 2：趋势衰竭（末端不追）
 * ✅ now 用 m5 closeTime
 */
export function gateTrendExhaustion(ctx, side, now) {
    const h1 = ctx.h1;
    if (!h1)
        return PASS;
    const legs = h1?.legs;
    const swing = h1?.swing;
    // 例：如果你有这些字段，就做衰竭过滤；没有就 PASS
    const impulseAvg = legs?.impulseAvg;
    const pullbackAvg = legs?.pullbackAvg;
    // 1) 推进/回撤比异常：末端“拉不动”
    if (impulseAvg != null && pullbackAvg != null && pullbackAvg > 0) {
        const ratio = impulseAvg / pullbackAvg;
        // ratio 太低：推进弱、回撤强，容易衰竭（阈值你可调）
        if (ratio < 1.25) {
            return FAIL('EXH_LEGS_WEAK', { ratio, impulseAvg, pullbackAvg, now });
        }
    }
    // 2) 结构破坏迹象（示例）：多头时 lastHL 被跌破、空头时 lastLH 被突破（你字段兼容就行）
    const lastHL = swing?.lastHL;
    const lastLH = swing?.lastLH;
    const m5Close = ctx.m5?.lastKline?.close;
    if (m5Close != null) {
        if (side === 'long' && lastHL != null && m5Close < lastHL) {
            return FAIL('EXH_BREAK_LASTHL', { m5Close, lastHL });
        }
        if (side === 'short' && lastLH != null && m5Close > lastLH) {
            return FAIL('EXH_BREAK_LASTLH', { m5Close, lastLH });
        }
    }
    return PASS;
}
/**
 * gate 3：高波动过滤（ATR% / 针 / 异常放量）
 * ✅ now 用 m5 closeTime（主要用于 meta/一致性）
 */
export function gateHighVolatility(ctx, now) {
    const m5 = ctx.m5;
    const k = m5?.lastKline;
    const close = k?.close ?? 0;
    if (!k || !close)
        return PASS;
    // 1) ATR% 过大（你字段兼容已做，这里就直接用）
    const atrPct = m5.atrPct;
    if (atrPct != null && atrPct > 0.009) {
        return FAIL('VOL_ATR_TOO_HIGH', { atrPct, now });
    }
    // 2) 影线过长（针）
    const body = Math.abs(k.close - k.open);
    const range = Math.max(1e-9, k.high - k.low);
    const upperWick = k.high - Math.max(k.open, k.close);
    const lowerWick = Math.min(k.open, k.close) - k.low;
    const bodyRatio = body / range;
    const wickRatio = (upperWick + lowerWick) / range;
    if (bodyRatio < 0.22 && wickRatio > 0.78) {
        return FAIL('VOL_WICK_SPIKE', { bodyRatio, wickRatio, now });
    }
    // 3) 异常放量
    const volume = k.volume;
    const volSMA = m5.volSMA;
    if (volume != null && volSMA != null && volSMA > 0) {
        const v = volume / volSMA;
        if (v > 3.2)
            return FAIL('VOL_VOLUME_SPIKE', { v, now });
    }
    return PASS;
}
