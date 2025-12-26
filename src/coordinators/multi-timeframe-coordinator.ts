// multi-timeframe-coordinator.ts
import type { Interval } from '@/types/market.js'
import type { BaseKlineManager } from '@/managers/base-kline-manager.js'

/**
 * =========================
 * 类型定义
 * =========================
 */
export interface CoordinatorOptions {
    symbol: string

    // freshness：每个周期允许“多旧”（以该周期 step 的倍数）
    // 比如 5m 的 closeTime 超过 2 根还没更新，就认为 stale
    staleBars: Partial<Record<Interval, number>>

    // 允许 5m 在 warning 状态下是否依旧允许交易
    // 建议默认 false（更保守）
    allowM5Warning?: boolean

    // 允许 1h warning 是否允许交易（通常可以允许）
    allowH1Warning?: boolean

    // 允许 4h warning 是否允许交易（通常可以允许）
    allowH4Warning?: boolean

    // 轮询间隔：如果你没有事件总线，就用轮询来触发 state change
    pollMs?: number
}
export interface DecisionState {
    time: number
    allowTrade: boolean
    allowLong: boolean
    allowShort: boolean
    warnings: string[]
}

export interface TriggerState {
    time: number
    interval: Interval
    reason: 'event' | 'poll'
}

export interface CoordinatorState {
    decision: DecisionState
    trigger?: TriggerState
}

/**
 * =========================
 * 周期分层定义
 * =========================
 */

// 决策周期（低频、稳定）
const DECISION_INTERVALS: Interval[] = ['5m', '15m', '1h', '4h']

// 触发周期（高频、timing）
const TRIGGER_INTERVALS: string[] = ['1m']

/**
 * =========================
 * Coordinator 实现
 * =========================
 */

export class MultiTimeframeCoordinator {
    private managers: Record<Interval, BaseKlineManager>

    private lastDecision: DecisionState | null = null

    private decisionListeners = new Set<(d: DecisionState) => void>()
    private triggerListeners = new Set<(s: CoordinatorState) => void>()

    private pollTimer?: NodeJS.Timeout
    private readonly pollMs: number

    constructor(
        managers: Record<Interval, BaseKlineManager>,
        private readonly opts: CoordinatorOptions
    ) {
        this.managers = managers
        this.pollMs = opts?.pollMs ?? 0
    }

    /**
     * =========================
     * 对外事件入口（核心）
     * =========================
     */

    /**
     * ⭐ 事件驱动入口
     * 由 BaseKlineManager.onClosedKline 调用
     */
    public onIntervalClosed(interval: Interval, time: number, reason: 'event' | 'poll' = 'event') {
        // 1️⃣ 决策层：只在决策周期更新
        if (DECISION_INTERVALS.includes(interval)) {
            const decision = this.computeDecision(time)
            this.lastDecision = decision
            this.emitDecision(decision)
        }

        // 2️⃣ 触发层：只在触发周期触发
        if (TRIGGER_INTERVALS.includes(interval)) {
            if (!this.lastDecision) return
            if (!this.lastDecision.allowTrade) return

            const state: CoordinatorState = {
                decision: this.lastDecision,
                trigger: {
                    time,
                    interval,
                    reason,
                },
            }

            this.emitTrigger(state)
        }
    }

    /**
     * =========================
     * 轮询兜底
     * =========================
     */

    /**
     * ⭐ 单次兜底 tick（供轮询或外部调用）
     */
    public tickOnce(reason: 'poll' = 'poll') {
        const now = Date.now()

        // 轮询兜底：只负责「刷新 decision」
        const decision = this.computeDecision(now)
        this.lastDecision = decision
        this.emitDecision(decision)

        // ❗ 注意：轮询不主动触发 trigger
        // trigger 只来自事件（1m close）
    }

    /**
     * ⭐ 启动轮询兜底
     */
    public start() {
        if (this.pollMs <= 0) return
        if (this.pollTimer) return

        this.pollTimer = setInterval(() => {
            this.tickOnce('poll')
        }, this.pollMs)
    }

    public stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer)
            this.pollTimer = undefined
        }
    }

    /**
     * =========================
     * 决策计算（核心逻辑）
     * =========================
     */

    private computeDecision(time: number): DecisionState {
        const warnings: string[] = []

        /**
         * 你原来 computeState 里
         * 所有「大周期一致性 / warning / stale」
         * 的逻辑，都应该迁移到这里
         */

        const m5 = this.managers['5m']?.getSnapshot()
        const m15 = this.managers['15m']?.getSnapshot()
        const h1 = this.managers['1h']?.getSnapshot()
        const h4 = this.managers['4h']?.getSnapshot()

        // === 示例判断（你可以替换为你自己的逻辑）===
        let allowTrade = true
        let allowLong = true
        let allowShort = true

        if (!m5 || !h1 || !h4) {
            allowTrade = false
            warnings.push('missing_snapshot')
        }

        // 示例：大周期冲突
        if (m5 && h1 && m5.trend !== h1.trend) {
            warnings.push('m5_h1_conflict')
        }

        return {
            time,
            allowTrade,
            allowLong,
            allowShort,
            warnings,
        }
    }

    /**
     * =========================
     * 事件订阅
     * =========================
     */

    public onDecisionChange(fn: (d: DecisionState) => void) {
        this.decisionListeners.add(fn)
        return () => this.decisionListeners.delete(fn)
    }

    public onTrigger(fn: (s: CoordinatorState) => void) {
        this.triggerListeners.add(fn)
        return () => this.triggerListeners.delete(fn)
    }

    private emitDecision(d: DecisionState) {
        for (const fn of this.decisionListeners) {
            fn(d)
        }
    }

    private emitTrigger(s: CoordinatorState) {
        for (const fn of this.triggerListeners) {
            fn(s)
        }
    }
}
