import { StrategyContext } from '@/strategy/strategy-context.js'
import {
    CoordinatorPermission,
    CoordinatorState,
    TriggerPayload,
    optsConfig,
} from '@/types/coordinator.js'
import type { Kline, KlineSnapshot, TimeHealth } from '@/types/market.js'
import type { Interval } from '@/types/market.js'
import { TradePermission } from '@/types/strategy.js'
import { intervalToMs } from '@/utils/interval.js'

/**
 * =============== Types ===============
 */

/**
 * =============== Coordinator ===============
 *
 * 核心设计原则：
 * 1️⃣ 只接受「5m close」作为触发源
 * 2️⃣ Decision（是否允许交易）与 Trigger（触发策略）彻底分离
 * 3️⃣ h1 / h4 只影响 Decision，不直接触发 Strategy
 */
export class MultiTimeframeCoordinator {
    private opts: optsConfig

    private lastClosed: Partial<Record<Interval, number>> = {}

    private lastDecision: CoordinatorPermission | null = null
    private lastState: StrategyContext | null = null

    // listeners
    private decisionListeners = new Set<(d: StrategyContext) => void>()
    private triggerListeners = new Set<(t: StrategyContext) => void>()

    constructor(opts: optsConfig) {
        this.opts = opts
    }

    /**
     * ================== Public API ==================
     */

    /**
     * bind-events 会在「5m 收盘」时调用这里
     */
    on5mClosed(kline: Record<Interval, KlineSnapshot | null>) {
        const closeTime = kline['5m']?.closeTime

        // 防止重复 close（极其重要）
        if (this.lastClosed['5m'] === closeTime) {
            return
        }

        this.lastClosed['5m'] = closeTime

        // ① 重新计算 Decision
        const decision = this.recomputeDecision(kline)
        console.log('[ decision ] >', decision)
        // ② 生成 state（用于 StrategyContext）
        this.lastState = {
            symbol: this.opts.symbol,
            trigger: {
                interval: '5m',
                closeTime,
            },
            snapshots: kline,
            createdAt: closeTime,
            permission: decision,
            lastClosed: { ...this.lastClosed },
        }
        this.emitDecision(this.lastState)
        // ③ 仅在 allowed 时触发 Strategy
        if (decision.allowed) {
            this.emitTrigger(this.lastState)
        }
    }

    /**
     * h1 / h4 只更新状态，不触发 Strategy
     */
    onHigherIntervalClosed(interval: '1h' | '4h' | '15m', kline: Kline) {
        this.lastClosed[interval] = kline.closeTime
        // 不触发任何 decision / trigger
    }

    /**
     * Strategy / bootstrap 调用
     */
    getState(): StrategyContext | null {
        return this.lastState
    }

    /**
     * ================== Events ==================
     */

    onDecisionChange(cb: (d: StrategyContext) => void) {
        this.decisionListeners.add(cb)
        return () => this.decisionListeners.delete(cb)
    }

    onTrigger(cb: (t: StrategyContext) => void) {
        this.triggerListeners.add(cb)
        return () => this.triggerListeners.delete(cb)
    }

    /**
     * ================== Internals ==================
     */

    private recomputeDecision(snapshots: Record<Interval, KlineSnapshot | null>): TradePermission {
        const reasons: string[] = []

        // 这里是你未来真正会扩展的地方
        const m5 = snapshots['5m']
        const m15 = snapshots['15m']
        const h1 = snapshots['1h']
        const h4 = snapshots['4h']
        const computedAt = m5?.updatedAt || Date.now()
        // 1) ready / snapshot 必须齐
        if (!m5?.ready || !h1?.ready || !h4?.ready) {
            return { allowed: false, reason: 'not_ready', detail: 'one or more managers not ready' }
        }
        if (!m5 || !h1 || !h4) {
            return {
                allowed: false,
                reason: 'missing_snapshot',
                detail: 'one or more snapshots are null',
            }
        }

        // 2) freshness（避免 WS 活着但收不到收盘 K 的“假健康”）
        const stale = this.checkStale({ m5, h1, h4, now: computedAt })
        if (stale) return stale

        // 3) timeHealth 级联（核心）
        const h4Health: TimeHealth = (h4.timeHealth ?? 'healthy') as TimeHealth
        const h1Health: TimeHealth = (h1.timeHealth ?? 'healthy') as TimeHealth
        const m5Health: TimeHealth = (m5.timeHealth ?? 'healthy') as TimeHealth

        // L3：4h broken => 全部不可交易
        if (h4Health === 'broken') {
            return { allowed: false, reason: '4h_unhealthy', detail: '4h timeHealth=broken' }
        }
        if (h4Health === 'warning') {
            return {
                allowed: false,
                reason: '4h_unhealthy',
                detail: '4h timeHealth=warning (blocked by config)',
            }
        }

        // L2：1h broken => 不可交易（但不要求你断 5m/4h）
        if (h1Health === 'broken') {
            return { allowed: false, reason: '1h_unhealthy', detail: '1h timeHealth=broken' }
        }
        if (h1Health === 'warning' && this.opts.allowH1Warning === false) {
            return {
                allowed: false,
                reason: '1h_unhealthy',
                detail: '1h timeHealth=warning (blocked by config)',
            }
        }

        // L1：5m unstable => 冻结执行信号（默认 warning 也算不稳定）
        if (m5Health === 'broken') {
            return { allowed: false, reason: '5m_unstable', detail: '5m timeHealth=broken' }
        }
        if (m5Health === 'warning' && !this.opts.allowM5Warning) {
            return { allowed: false, reason: '5m_unstable', detail: '5m timeHealth=warning' }
        }

        return { allowed: true, reason: 'ok' }
    }

    private checkStale(input: {
        m5: KlineSnapshot
        h1: KlineSnapshot
        h4: KlineSnapshot
        now: number
    }): TradePermission | null {
        const { m5, h1, h4, now } = input

        const staleBars = {
            '5m': this.opts.staleBars['5m'] ?? 2,
            '15m': this.opts.staleBars['15m'] ?? 2,
            '1h': this.opts.staleBars['1h'] ?? 2,
            '4h': this.opts.staleBars['4h'] ?? 2,
        } satisfies Record<Interval, number>

        const checks: Array<{ s: KlineSnapshot; interval: Interval }> = [
            { s: m5, interval: '5m' },
            // { s: h1, interval: '1h' },
            // { s: h4, interval: '4h' },
        ]

        for (const { s, interval } of checks) {
            const step = intervalToMs(interval)
            const maxAge = step * staleBars[interval]
            const age = now - s.closeTime

            // 服务器时间如果被调过可能出现负数，这也要挡一下
            if (age < -5_000) {
                return {
                    allowed: false,
                    reason: 'clock_skew',
                    detail: `${interval} closeTime is in the future`,
                }
            }

            if (age > maxAge) {
                return {
                    allowed: false,
                    reason: 'stale_data',
                    detail: `${interval} stale: age=${Math.round(age / 1000)}s > max=${Math.round(
                        maxAge / 1000
                    )}s`,
                }
            }
        }

        return null
    }

    private emitDecision(d: StrategyContext) {
        for (const cb of this.decisionListeners) {
            cb(d)
        }
    }

    private emitTrigger(t: StrategyContext) {
        for (const cb of this.triggerListeners) {
            cb(t)
        }
    }
}
