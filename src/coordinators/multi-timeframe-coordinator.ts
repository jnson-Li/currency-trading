import { CoordinatorPermission, CoordinatorState, TriggerPayload } from '@/types/coordinator.js'
import type { Kline, KlineSnapshot } from '@/types/market.js'
import type { Interval } from '@/types/market.js'

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
    private symbol: string

    private lastClosed: Partial<Record<Interval, number>> = {}

    private lastDecision: CoordinatorPermission | null = null
    private lastState: CoordinatorState | null = null

    // listeners
    private decisionListeners = new Set<(d: CoordinatorPermission) => void>()
    private triggerListeners = new Set<(t: TriggerPayload) => void>()

    constructor(opts: {
        symbol: string
        staleBars: Partial<Record<Interval, number>>
        allowM5Warning: boolean
        allowH1Warning: boolean
        allowH4Warning: boolean
    }) {
        this.symbol = opts.symbol
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
            symbol: this.symbol,
            computedAt: closeTime,
            permission: decision,
            lastClosed: { ...this.lastClosed },
        }

        // ③ 仅在 allowed 时触发 Strategy
        if (decision.allowed) {
            this.emitTrigger({
                interval: '5m',
                time: closeTime,
            })
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
    getState(): CoordinatorState | null {
        return this.lastState
    }

    /**
     * ================== Events ==================
     */

    onDecisionChange(cb: (d: CoordinatorPermission) => void) {
        this.decisionListeners.add(cb)
        return () => this.decisionListeners.delete(cb)
    }

    onTrigger(cb: (t: TriggerPayload) => void) {
        this.triggerListeners.add(cb)
        return () => this.triggerListeners.delete(cb)
    }

    /**
     * ================== Internals ==================
     */

    private recomputeDecision(
        snapshots: Record<Interval, KlineSnapshot | null>
    ): CoordinatorPermission {
        const reasons: string[] = []

        // 这里是你未来真正会扩展的地方
        // 当前示例逻辑：只要 5m 有 close，就允许
        if (!this.lastClosed['5m']) {
            reasons.push('5m_not_closed')
        }

        const next: CoordinatorPermission = {
            allowed: reasons.length === 0,
            reasons,
        }

        if (
            !this.lastDecision ||
            next.allowed !== this.lastDecision.allowed ||
            next.reasons.join('|') !== this.lastDecision.reasons.join('|')
        ) {
            this.lastDecision = next
            this.emitDecision(next)
        }

        return next
    }

    private emitDecision(d: CoordinatorPermission) {
        for (const cb of this.decisionListeners) {
            cb(d)
        }
    }

    private emitTrigger(t: TriggerPayload) {
        for (const cb of this.triggerListeners) {
            cb(t)
        }
    }
}
