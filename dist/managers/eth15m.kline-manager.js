import { BaseKlineManager } from './base-kline-manager.js';
import { calcEMA } from '../utils/ema.js';
import { findSwings } from '../utils/swing.js';
function calcATR(klines, period) {
    if (klines.length < period + 1)
        return null;
    let sum = 0;
    for (let i = klines.length - period; i < klines.length; i++) {
        const cur = klines[i];
        const prev = klines[i - 1];
        const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
        sum += tr;
    }
    return sum / period;
}
export class ETH15mKlineManager extends BaseKlineManager {
    constructor() {
        super('ETHUSDT', '15m');
    }
    HTTP_LIMIT = 50;
    CACHE_LIMIT = 200;
    LOG_PREFIX = 'ETH 15m';
    // —— 状态
    trend = 'range';
    structure = 'range';
    // —— 指标
    ema21;
    atr14;
    atrPct;
    // —— swing（提供给 gate / debug）
    lastSwingHigh;
    lastSwingLow;
    // —— 切换冷却：结构变更时间（给 TrendSwitch gate 用）
    lastStructureChangeAt;
    // —— 稳定性：避免结构一抖就切
    pendingStructure = 'range';
    pendingCount = 0;
    /**
     * 15m 是“分析周期”，不是执行周期
     */
    updateAnalysis() {
        this.updateIndicators();
        this.updateTrend();
        this.updateStructure();
    }
    /* ========= 指标 ========= */
    updateIndicators() {
        if (this.klines.length < 30)
            return;
        const closes = this.klines.map((k) => k.close);
        const last = this.klines[this.klines.length - 1];
        this.ema21 = calcEMA(closes, 21) ?? undefined;
        this.atr14 = calcATR(this.klines, 14) ?? undefined;
        this.atrPct = this.atr14 && last.close ? this.atr14 / last.close : undefined;
    }
    /* ========= 趋势（加 buffer，抗抖动） ========= */
    updateTrend() {
        const last = this.klines[this.klines.length - 1];
        if (!last || !this.ema21) {
            this.trend = 'range';
            return;
        }
        // ✅ EMA buffer：避免 close 在 EMA 附近来回穿导致 trend 抖动
        // 15m 推荐：0.15%~0.30%（看你风格）
        const bufferPct = 0.002; // 0.2%
        const upper = this.ema21 * (1 + bufferPct);
        const lower = this.ema21 * (1 - bufferPct);
        if (last.close > upper)
            this.trend = 'bull';
        else if (last.close < lower)
            this.trend = 'bear';
        else
            this.trend = 'range';
    }
    /* ========= 结构（加稳定确认 + 记录切换时间） ========= */
    updateStructure() {
        const last = this.klines[this.klines.length - 1];
        if (!last) {
            this.structure = 'range';
            return;
        }
        const { highs, lows } = findSwings(this.klines, 3);
        // 更新最近 swing 给 snapshot 使用
        if (highs.length > 0)
            this.lastSwingHigh = highs[highs.length - 1];
        if (lows.length > 0)
            this.lastSwingLow = lows[lows.length - 1];
        if (highs.length < 2 || lows.length < 2) {
            this.applyStableStructure('range');
            return;
        }
        const h1 = highs[highs.length - 2];
        const h2 = highs[highs.length - 1];
        const l1 = lows[lows.length - 2];
        const l2 = lows[lows.length - 1];
        let next = 'range';
        if (h2 > h1 && l2 > l1)
            next = 'hh_hl';
        else if (h2 < h1 && l2 < l1)
            next = 'lh_ll';
        else
            next = 'range';
        // ✅ 稳定确认：连续 N 次判定相同才切换（减少抖动）
        this.applyStableStructure(next);
    }
    applyStableStructure(next) {
        const STABLE_N = 2; // 连续2次（即 2 根 15m close）确认再切换，你可调：2~3
        if (next !== this.pendingStructure) {
            this.pendingStructure = next;
            this.pendingCount = 1;
            return;
        }
        this.pendingCount += 1;
        if (this.pendingCount < STABLE_N)
            return;
        if (next !== this.structure) {
            this.structure = next;
            this.lastStructureChangeAt = Date.now();
        }
    }
    /* ========= snapshot 扩展 ========= */
    getExtraSnapshot() {
        const last = this.lastKline;
        if (!last) {
            return {};
        }
        const body = Math.abs(last.close - last.open);
        const range = Math.max(1e-9, last.high - last.low);
        const upperWick = last.high - Math.max(last.open, last.close);
        const lowerWick = Math.min(last.open, last.close) - last.low;
        const wickRatio = (upperWick + lowerWick) / range;
        const bodyRatio = body / range;
        return {
            // 给 gate 使用
            atr14: this.atr14,
            atrPct: this.atrPct,
            ema21: this.ema21,
            // “针”过滤器所需
            wickRatio,
            bodyRatio,
            // 结构边界 & 切换冷却
            swing: {
                high: this.lastSwingHigh,
                low: this.lastSwingLow,
            },
            lastStructureChangeAt: this.lastStructureChangeAt,
            // 方便调试
            pending: {
                structure: this.pendingStructure,
                count: this.pendingCount,
            },
        };
    }
}
