import { EXEC_REASON } from '@/execution/execution-reject-reasons.js';
const defaultCfg = {
    orderType: 'market',
    fixedQty: 0,
    qtyFactor: 0.02,
    minQty: 0.001,
    maxQty: 1,
    spreadPct: 0.0004,
    maxSlippagePct: 0.0006,
    latencyMs: { min: 50, max: 300 },
    timeoutMs: 1200,
    limitOffsetPct: 0.00025,
    limitWaitMs: 60_000,
    rejectProb: 0.005,
    rng: () => Math.random(),
};
/**
 * PaperExecutionEngine：用真实行情（ctx.m5.lastKline.close）模拟成交
 */
export class PaperExecutionEngine {
    cfg;
    constructor(cfg) {
        this.cfg = {
            ...defaultCfg,
            ...cfg,
            latencyMs: { ...defaultCfg.latencyMs, ...(cfg?.latencyMs ?? {}) },
            rng: cfg?.rng ?? defaultCfg.rng,
            onResult: cfg?.onResult,
        };
    }
    async execute(signal, ctx) {
        const startedAt = Date.now();
        const signalId = makeSignalId(signal, ctx);
        // 0) 基础校验
        const symbol = signal.symbol;
        const side = signal.side;
        const marketPrice = getMarketPriceFromCtx(ctx);
        if (!marketPrice || !Number.isFinite(marketPrice)) {
            return this.finish(startedAt, { signalId, accepted: false, reason: EXEC_REASON.NO_MARKET_PRICE, symbol, side }, signal, ctx);
        }
        // 1) 模拟拒单
        if (this.cfg.rejectProb > 0 && this.cfg.rng() < this.cfg.rejectProb) {
            return this.finish(startedAt, {
                signalId,
                accepted: false,
                reason: EXEC_REASON.EXCHANGE_REJECT,
                symbol,
                side,
                marketPrice,
            }, signal, ctx);
        }
        // 2) 模拟延迟 + 超时
        const latency = randInt(this.cfg.latencyMs.min, this.cfg.latencyMs.max, this.cfg.rng);
        if (latency > this.cfg.timeoutMs) {
            return this.finish(startedAt, {
                signalId,
                accepted: false,
                reason: EXEC_REASON.EXEC_TIMEOUT,
                symbol,
                side,
                marketPrice,
                latencyMs: latency,
            }, signal, ctx);
        }
        await sleep(latency);
        // 3) qty 计算（最简单可用：confidence 映射）
        const qty = this.calcQty(signal);
        // 4) 计算成交（market/limit）
        const orderType = this.cfg.orderType;
        if (orderType === 'market') {
            const filled = simulateMarketFill({
                side,
                marketPrice,
                spreadPct: this.cfg.spreadPct,
                maxSlippagePct: this.cfg.maxSlippagePct,
                rng: this.cfg.rng,
            });
            return this.finish(startedAt, {
                signalId,
                accepted: true,
                symbol,
                side,
                orderType,
                qty,
                marketPrice,
                requestedPrice: signal.price,
                filledPrice: filled.filledPrice,
                slippagePct: filled.slippagePct,
                spreadPct: this.cfg.spreadPct,
                openedAt: Date.now(),
                latencyMs: latency,
                reason: EXEC_REASON.EXECUTED_MARKET,
                meta: {
                    confidence: signal.confidence,
                    model: 'paper_market',
                },
            }, signal, ctx);
        }
        // limit
        const limitPrice = simulateLimitPrice({
            side,
            marketPrice,
            offsetPct: this.cfg.limitOffsetPct,
        });
        const limitRes = await simulateLimitFill({
            side,
            marketPrice,
            limitPrice,
            waitMs: this.cfg.limitWaitMs,
            rng: this.cfg.rng,
        });
        if (!limitRes.filled) {
            return this.finish(startedAt, {
                signalId,
                accepted: false,
                reason: EXEC_REASON.LIMIT_NOT_FILLED,
                symbol,
                side,
                orderType,
                qty,
                marketPrice,
                requestedPrice: signal.price,
                latencyMs: latency,
                meta: { limitPrice, waitedMs: limitRes.waitedMs, model: 'paper_limit' },
            }, signal, ctx);
        }
        // limit filled（限价一般滑点更小，这里用更小的随机）
        const filled = simulateLimitSlippage({
            side,
            fillPrice: limitPrice,
            maxSlippagePct: Math.min(this.cfg.maxSlippagePct * 0.35, 0.00025),
            rng: this.cfg.rng,
        });
        return this.finish(startedAt, {
            signalId,
            accepted: true,
            symbol,
            side,
            orderType,
            qty,
            marketPrice,
            requestedPrice: signal.price,
            filledPrice: filled.filledPrice,
            slippagePct: filled.slippagePct,
            spreadPct: this.cfg.spreadPct,
            openedAt: Date.now(),
            latencyMs: latency + limitRes.waitedMs,
            reason: EXEC_REASON.EXECUTED_LIMIT,
            meta: {
                limitPrice,
                waitedMs: limitRes.waitedMs,
                confidence: signal.confidence,
                model: 'paper_limit',
            },
        }, signal, ctx);
    }
    calcQty(signal) {
        if (this.cfg.fixedQty && this.cfg.fixedQty > 0)
            return clamp(this.cfg.fixedQty, this.cfg.minQty, this.cfg.maxQty);
        const c = Number(signal.confidence ?? 0);
        const raw = c * this.cfg.qtyFactor;
        return clamp(raw, this.cfg.minQty, this.cfg.maxQty);
    }
    finish(startedAt, res, signal, ctx) {
        // 统一补充 latencyMs（如果没填）
        if (res.latencyMs == null)
            res.latencyMs = Date.now() - startedAt;
        try {
            this.cfg.onResult?.(res, signal, ctx);
        }
        catch {
            // 落地回调不能影响主流程
        }
        return res;
    }
}
/* ================== helpers ================== */
function getMarketPriceFromCtx(ctx) {
    // 最优：5m lastKline.close
    const k = ctx?.m5?.lastKline;
    const p = k?.close ?? ctx?.m5?.lastClose ?? ctx?.m5?.lastPrice;
    return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
}
function makeSignalId(signal, ctx) {
    // 推荐：closeTime 作为幂等 key（同一根 5m 只执行一次）
    const closeTime = ctx?.trigger?.closeTime ?? signal.createdAt;
    return `SIG:${signal.symbol}:${signal.side}:${closeTime}`;
}
function simulateMarketFill(input) {
    const { side, marketPrice, spreadPct, maxSlippagePct, rng } = input;
    // 先加点差（买在 ask，卖在 bid）
    const halfSpread = spreadPct / 2;
    const withSpread = side === 'long' ? marketPrice * (1 + halfSpread) : marketPrice * (1 - halfSpread);
    // 再加滑点（随机，偏小）
    const slip = (rng() * 2 - 1) * maxSlippagePct;
    const filledPrice = side === 'long'
        ? withSpread * (1 + Math.abs(slip)) // 买更贵
        : withSpread * (1 - Math.abs(slip)); // 卖更便宜
    const slippagePct = Math.abs(filledPrice - withSpread) / withSpread;
    return { filledPrice, slippagePct };
}
function simulateLimitPrice(input) {
    const { side, marketPrice, offsetPct } = input;
    // long：挂在 market 下方；short：挂在 market 上方
    return side === 'long' ? marketPrice * (1 - offsetPct) : marketPrice * (1 + offsetPct);
}
async function simulateLimitFill(input) {
    const { marketPrice, limitPrice, waitMs, rng } = input;
    // 这里做一个“足够实用”的简化：
    // limit 离市场越远，成交概率越低；允许等待 waitMs
    // 你也可以以后用更真实的 tick/盘口来替换这里
    const distPct = Math.abs(limitPrice - marketPrice) / marketPrice;
    // distPct 越大，p 越低；最小给一点概率，避免永不成交
    const pFill = clamp(0.85 - distPct * 220, 0.03, 0.85);
    // 模拟等待：用一次抽样决定是否成交，成交则给一个随机等待时间
    const filled = rng() < pFill;
    if (!filled) {
        // 模拟“等满也没成交”
        await sleep(Math.min(10, waitMs)); // 不要真的等 60s，纸上执行只要逻辑
        return { filled: false, waitedMs: waitMs };
    }
    // 成交：等待时间越接近 0 越像“马上打到”
    const waitedMs = Math.floor(rng() * Math.min(waitMs, 10_000));
    await sleep(Math.min(10, waitedMs));
    return { filled: true, waitedMs };
}
function simulateLimitSlippage(input) {
    const { side, fillPrice, maxSlippagePct, rng } = input;
    const slip = Math.abs((rng() * 2 - 1) * maxSlippagePct);
    const filledPrice = side === 'long' ? fillPrice * (1 + slip) : fillPrice * (1 - slip);
    const slippagePct = Math.abs(filledPrice - fillPrice) / fillPrice;
    return { filledPrice, slippagePct };
}
function clamp(x, min, max) {
    return Math.max(min, Math.min(max, x));
}
function randInt(min, max, rng) {
    if (max <= min)
        return min;
    return Math.floor(min + rng() * (max - min + 1));
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
