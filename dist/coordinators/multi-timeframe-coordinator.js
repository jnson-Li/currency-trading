import { intervalToMs } from '@/utils/interval.js';
/**
 * =============== Coordinator ===============
 *
 * 核心设计原则：
 * 1️⃣ 只接受「5m close」作为触发源
 * 2️⃣ Decision（是否允许交易）与 Trigger（触发策略）彻底分离
 * 3️⃣ 15m/1h/4h 只影响 Decision，不直接触发 Strategy
 */
export class MultiTimeframeCoordinator {
    opts;
    log;
    lastClosed = {};
    lastDecision = null;
    lastState = null;
    // listeners
    decisionListeners = new Set();
    triggerListeners = new Set();
    constructor(opts) {
        this.opts = opts;
        this.log = opts.logger ?? null;
    }
    /**
     * ================== Public API ==================
     */
    /**
     * bind-events 会在「5m 收盘」时调用这里
     */
    on5mClosed(kline) {
        if (!kline)
            return null;
        const m5 = kline['5m'];
        const closeTime = m5?.lastKline?.closeTime;
        if (typeof closeTime !== 'number' || !Number.isFinite(closeTime)) {
            this.log?.warn?.('[coordinator] invalid 5m closeTime', { closeTime });
            return null;
        }
        // 防止重复 close（极其重要：重连/补数据/重复事件都可能发生）
        if (this.lastClosed['5m'] === closeTime)
            return null;
        this.lastClosed['5m'] = closeTime;
        // ① 重新计算 Decision
        const now = Date.now();
        const decision = this.recomputeDecision(kline, now);
        // ② 生成 state（用于 StrategyEngine）
        this.lastState = {
            symbol: this.opts.symbol,
            trigger: {
                interval: '5m',
                closeTime,
            },
            m5: kline['5m'],
            m15: kline['15m'],
            h1: kline['1h'],
            h4: kline['4h'],
            createdAt: closeTime,
            permission: decision,
            lastClosed: { ...this.lastClosed },
        };
        // ③ emit decision（按配置可选择仅变化时 emit）
        const onlyChange = this.opts.emitDecisionOnlyOnChange ?? true;
        const changed = !this.sameDecision(this.lastDecision, decision);
        this.lastDecision = decision;
        if (!onlyChange || changed) {
            this.emitDecision(this.lastState);
        }
        else {
            // 仅 debug：避免刷屏
            this.log?.debug?.('[coordinator] decision unchanged, skipped emit');
        }
        // ④ 仅在 allowed 时触发 Strategy
        if (decision.allowed) {
            this.emitTrigger(this.lastState);
        }
        return this.lastState;
    }
    /**
     * h1 / h4 / 15m 收盘：只记录收盘时间（不触发策略）
     * （你的系统设计是：触发源只来自 5m close）
     */
    onHigherIntervalClosed(interval, kline) {
        const ct = kline?.closeTime;
        if (typeof ct === 'number' && Number.isFinite(ct)) {
            this.lastClosed[interval] = ct;
        }
    }
    /**
     * Strategy / bootstrap 调用：获取最近一次完整 ctx
     */
    getState() {
        return this.lastState;
    }
    /**
     * ================== Events ==================
     */
    onDecisionChange(cb) {
        this.decisionListeners.add(cb);
        return () => this.decisionListeners.delete(cb);
    }
    onTrigger(cb) {
        this.triggerListeners.add(cb);
        return () => this.triggerListeners.delete(cb);
    }
    /**
     * ================== Internals ==================
     */
    recomputeDecision(snapshots, now) {
        const m5 = snapshots['5m'];
        const m15 = snapshots['15m'];
        const h1 = snapshots['1h'];
        const h4 = snapshots['4h'];
        // 1) ready / snapshot 必须齐（你策略链路需要 5m/15m/1h/4h）
        if (!m5?.ready || !m15?.ready || !h1?.ready || !h4?.ready) {
            return {
                allowed: false,
                reason: 'not_ready',
                detail: 'one or more managers not ready',
            };
        }
        if (!m5 || !m15 || !h1 || !h4) {
            return {
                allowed: false,
                reason: 'missing_snapshot',
                detail: 'one or more snapshots are null',
            };
        }
        // 2) freshness（避免 WS 活着但收不到收盘 K 的“假健康”）
        const stale = this.checkStale({ m5, m15, h1, h4, now });
        if (stale)
            return stale;
        // 3) timeHealth 级联（核心）
        const h4Health = (h4.timeHealth ?? 'healthy');
        const h1Health = (h1.timeHealth ?? 'healthy');
        const m15Health = (m15.timeHealth ?? 'healthy');
        const m5Health = (m5.timeHealth ?? 'healthy');
        // L3：4h broken => 全部不可交易
        if (h4Health === 'broken') {
            return { allowed: false, reason: '4h_unhealthy', detail: '4h timeHealth=broken' };
        }
        if (h4Health === 'warning' && this.opts.allowH4Warning === false) {
            return {
                allowed: false,
                reason: '4h_unhealthy',
                detail: '4h timeHealth=warning (blocked by config)',
            };
        }
        // L2：1h broken => 不可交易
        if (h1Health === 'broken') {
            return { allowed: false, reason: '1h_unhealthy', detail: '1h timeHealth=broken' };
        }
        if (h1Health === 'warning' && this.opts.allowH1Warning === false) {
            return {
                allowed: false,
                reason: '1h_unhealthy',
                detail: '1h timeHealth=warning (blocked by config)',
            };
        }
        // L2.5：15m broken => 不可交易（warning 默认允许，避免过度误杀）
        if (m15Health === 'broken') {
            return { allowed: false, reason: '15m_unhealthy', detail: '15m timeHealth=broken' };
        }
        // L1：5m unstable => 冻结执行信号（默认 warning 也算不稳定）
        if (m5Health === 'broken') {
            return { allowed: false, reason: '5m_unstable', detail: '5m timeHealth=broken' };
        }
        if (m5Health === 'warning' && !this.opts.allowM5Warning) {
            return { allowed: false, reason: '5m_unstable', detail: '5m timeHealth=warning' };
        }
        return { allowed: true, reason: 'ok' };
    }
    checkStale(input) {
        const { m5, m15, h1, h4, now } = input;
        // 默认：每个周期最多允许 staleBars 根 K 线的“延迟”
        const staleBars = {
            '5m': this.opts.staleBars?.['5m'] ?? 2,
            '15m': this.opts.staleBars?.['15m'] ?? 2,
            '1h': this.opts.staleBars?.['1h'] ?? 2,
            '4h': this.opts.staleBars?.['4h'] ?? 2,
        };
        const checks = [
            { s: m5, interval: '5m' },
            { s: m15, interval: '15m' },
            { s: h1, interval: '1h' },
            { s: h4, interval: '4h' },
        ];
        for (const { s, interval } of checks) {
            if (!s?.lastKline?.closeTime) {
                return {
                    allowed: false,
                    reason: 'snapshot_is_null',
                    detail: `${interval} snapshot lastKline is null`,
                };
            }
            const confirmedClose = s.lastConfirmedCloseTime;
            if (typeof confirmedClose !== 'number') {
                return {
                    allowed: false,
                    reason: 'no_confirmed_close',
                    detail: `${interval} has no confirmed close`,
                };
            }
            const step = intervalToMs(interval);
            const maxAge = step * staleBars[interval];
            const age = s.updatedAt - confirmedClose;
            // 服务器时间如果被调过可能出现负数，这也要挡一下
            if (age < -5_000) {
                return {
                    allowed: false,
                    reason: 'clock_skew',
                    detail: `${interval} closeTime is in the future`,
                };
            }
            if (age > maxAge) {
                return {
                    allowed: false,
                    reason: 'stale_data',
                    detail: `${interval} stale: age=${Math.round(age / 1000)}s > max=${Math.round(maxAge / 1000)}s`,
                };
            }
        }
        return null;
    }
    sameDecision(a, b) {
        if (!a && !b)
            return true;
        if (!a || !b)
            return false;
        return (a.allowed === b.allowed &&
            a.reason === b.reason &&
            (a.detail ?? '') === (b.detail ?? ''));
    }
    emitDecision(d) {
        for (const cb of this.decisionListeners) {
            try {
                cb(d);
            }
            catch (e) {
                this.log?.error?.(e);
            }
        }
    }
    emitTrigger(t) {
        for (const cb of this.triggerListeners) {
            try {
                cb(t);
            }
            catch (e) {
                this.log?.error?.(e);
            }
        }
    }
}
