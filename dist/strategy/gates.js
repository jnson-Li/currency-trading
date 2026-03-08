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
    const h4 = ctx.h4;
    const h1 = ctx.h1;
    const m5Close = ctx.m5?.lastKline?.close;
    if (!h4)
        return PASS;
    // 1) 4h legs ratio：趋势动力衰竭（慢）
    const legs = h4?.legs;
    const impulseAvg = legs?.impulseAvg;
    const pullbackAvg = legs?.pullbackAvg;
    if (impulseAvg != null && pullbackAvg != null && pullbackAvg > 0) {
        const ratio = impulseAvg / pullbackAvg;
        if (ratio < 1.25) {
            return FAIL('EXH_LEGS_WEAK', { ratio, impulseAvg, pullbackAvg, now });
        }
    }
    // 2) 1h swing break：结构开始破坏（快）
    const swing1h = h1?.swing;
    const lastHL = swing1h?.lastHL;
    const lastLH = swing1h?.lastLH;
    if (m5Close != null) {
        if (side === 'long' && lastHL != null && m5Close < lastHL) {
            return FAIL('EXH_BREAK_1H_LASTHL', { m5Close, lastHL, now });
        }
        if (side === 'short' && lastLH != null && m5Close > lastLH) {
            return FAIL('EXH_BREAK_1H_LASTLH', { m5Close, lastLH, now });
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
    if (!m5 || !k || !k.close)
        return PASS;
    const t = now ?? k.closeTime ?? Date.now();
    // ====== 0) 基础字段 ======
    const atrPct = m5.atrPct;
    const atrPctSMA = m5.atrPctSMA;
    // 上级别确认（有就用，没有就当“未确认”）
    const h1AtrPct = ctx.h1?.atrPct;
    const h4AtrPct = ctx.h4?.atrPct;
    // ====== 1) 动态阈值（相对阈值 + 绝对上限兜底） ======
    // 绝对上限：防极端行情（比如插针/新闻）
    const ABS_MAX = 0.018; // 1.8%（你可调）
    if (atrPct != null && atrPct > ABS_MAX) {
        return FAIL('VOL_ATR_ABS_TOO_HIGH', { atrPct, absMax: ABS_MAX, now: t });
    }
    // 相对阈值：相对自己的“常态波动”
    // 比如：atrPct > atrPctSMA * 1.8 且 atrPct > 0.009 才算“异常”
    const REL_FACTOR = 1.8;
    const BASE_MIN = 0.009;
    let relSpike = false;
    if (atrPct != null && atrPctSMA != null && atrPctSMA > 0) {
        const rel = atrPct / atrPctSMA;
        if (rel > REL_FACTOR && atrPct > BASE_MIN) {
            relSpike = true;
        }
    }
    // ====== 2) 多周期确认：上级别也在高波动才强拦（减少误杀） ======
    // 你可以选：h1 确认 或 h4 确认，或者任意一个满足就算 confirmed
    const H1_CONFIRM = 0.012; // 1.2%
    const H4_CONFIRM = 0.01; // 1.0%
    const confirmed = (h1AtrPct != null && h1AtrPct > H1_CONFIRM) || (h4AtrPct != null && h4AtrPct > H4_CONFIRM);
    // 策略：动态触发时，如果上级别也确认 -> FAIL；否则只记录不拦（或轻拦）
    if (relSpike && confirmed) {
        return FAIL('VOL_ATR_REL_SPIKE_CONFIRMED', {
            atrPct,
            atrPctSMA,
            rel: atrPctSMA && atrPct ? atrPct / atrPctSMA : null,
            h1AtrPct,
            h4AtrPct,
            now: t,
        });
    }
    // 如果你想“轻拦”：relSpike 但没 confirmed 也挡掉，就打开这段：
    // if (relSpike && !confirmed) {
    //   return FAIL('VOL_ATR_REL_SPIKE', { atrPct, atrPctSMA, h1AtrPct, h4AtrPct, now: t })
    // }
    // ====== 3) 影线过长（针） ======
    const body = Math.abs(k.close - k.open);
    const range = Math.max(1e-9, k.high - k.low);
    const upperWick = k.high - Math.max(k.open, k.close);
    const lowerWick = Math.min(k.open, k.close) - k.low;
    const bodyRatio = body / range;
    const wickRatio = (upperWick + lowerWick) / range;
    if (bodyRatio < 0.22 && wickRatio > 0.78) {
        return FAIL('VOL_WICK_SPIKE', { bodyRatio, wickRatio, now: t });
    }
    // ====== 4) 异常放量 ======
    const volume = k.volume;
    const volSMA = m5.volSMA;
    if (volume != null && volSMA != null && volSMA > 0) {
        const v = volume / volSMA;
        if (v > 3.2)
            return FAIL('VOL_VOLUME_SPIKE', { v, now: t });
    }
    return PASS;
}
