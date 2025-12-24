// multi-timeframe-coordinator.ts
// 一个“完整版”的多周期协调器：
// - 统一收集 5m/1h/4h 的 snapshot
// - 做级联健康判断（5m 断不影响 1h/4h，但会冻结执行信号）
// - 输出统一的 trade gate（是否允许交易/推送信号）
// - 提供 onStateChange 订阅（便于你接规则引擎 / GPT / 推送）

import type { BaseKlineManager } from './base-kline-manager.js'
import { KlineSnapshot, IntervalLevel } from '@/types/market.js'
import type { TradePermission } from '@/types/strategy.js'

/** 你 BaseKlineManager 里已经有 timeHealth 的概念的话，建议统一成这三档 */
export type TimeHealth = 'healthy' | 'warning' | 'broken'
export type Interval = '5m' | '1h' | '4h'

export interface CoordinatorState {
    symbol: string
    snapshots: {
        m5: KlineSnapshot | null
        h1: KlineSnapshot | null
        h4: KlineSnapshot | null
    }
    permission: TradePermission
    computedAt: number
}

/** 配置：你可以按实际需要调 */
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

/** interval -> ms（建议放 utils，这里为了“完整版单文件”先内置） */
function intervalToMs(interval: Interval): number {
    const map: Record<Interval, number> = {
        '5m': 5 * 60_000,
        '1h': 60 * 60_000,
        '4h': 4 * 60 * 60_000,
    }
    return map[interval]
}

/** interval -> level */
function intervalToLevel(interval: Interval): IntervalLevel {
    if (interval === '5m') return 'L1'
    if (interval === '1h') return 'L2'
    return 'L3'
}

/** 简单深比较：足够用于 snapshot gate（避免频繁触发 onStateChange） */
function shallowEqual(a: any, b: any): boolean {
    if (a === b) return true
    if (!a || !b) return false
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    for (const k of ak) {
        if (a[k] !== b[k]) return false
    }
    return true
}

type StateListener = (state: CoordinatorState) => void

export class MultiTimeframeCoordinator {
    private listeners = new Set<StateListener>()
    private timer?: NodeJS.Timeout
    private lastState?: CoordinatorState

    constructor(
        private readonly m5: BaseKlineManager,
        private readonly h1: BaseKlineManager,
        private readonly h4: BaseKlineManager,
        private readonly opts: CoordinatorOptions
    ) {}

    /** 启动轮询（如果你后面给 BaseKlineManager 加事件，也可以不用轮询） */
    start() {
        const pollMs = this.opts.pollMs ?? 1000
        this.stop()
        this.timer = setInterval(() => this.tick(), pollMs)
        // 立即跑一次
        this.tick()
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = undefined
        }
    }

    /** 订阅状态变化 */
    onStateChange(fn: StateListener) {
        this.listeners.add(fn)
        // 订阅时立即推一次当前状态（如果已有）
        const s = this.getState()
        if (s) fn(s)
        return () => this.listeners.delete(fn)
    }

    /** 当前状态（不触发计算就返回最新缓存；如果没有缓存就计算一次） */
    getState(): CoordinatorState | null {
        if (!this.lastState) {
            const st = this.computeState()
            this.lastState = st
        }
        return this.lastState
    }

    /** 对外最常用：交易/推送信号是否允许 */
    getTradePermission(): TradePermission {
        return this.getState()?.permission ?? { allowed: false, reason: 'not_ready' }
    }

    /** 强制触发一次计算并广播（用于手动触发） */
    recomputeAndNotify() {
        const st = this.computeState()
        this.updateState(st, true)
    }

    // ===================== 内部逻辑 =====================

    private tick() {
        const st = this.computeState()
        this.updateState(st, false)
    }

    private updateState(next: CoordinatorState, forceNotify: boolean) {
        const prev = this.lastState
        this.lastState = next

        const changed =
            forceNotify ||
            !prev ||
            !shallowEqual(prev.permission, next.permission) ||
            !shallowEqual(prev.snapshots.m5, next.snapshots.m5) ||
            !shallowEqual(prev.snapshots.h1, next.snapshots.h1) ||
            !shallowEqual(prev.snapshots.h4, next.snapshots.h4)

        if (!changed) return

        for (const fn of this.listeners) {
            try {
                fn(next)
            } catch (e) {
                // 不要让某个 listener 影响主流程
                console.error('[MultiTimeframeCoordinator] listener error', e)
            }
        }
    }

    private computeState(): CoordinatorState {
        const computedAt = Date.now()

        const s5 = this.safeGetSnapshot(this.m5)
        const s1 = this.safeGetSnapshot(this.h1)
        const s4 = this.safeGetSnapshot(this.h4)

        const permission = this.computePermission({
            m5: s5,
            h1: s1,
            h4: s4,
            now: computedAt,
        })

        return {
            symbol: this.opts.symbol,
            snapshots: { m5: s5, h1: s1, h4: s4 },
            permission,
            computedAt,
        }
    }

    /** 兼容：如果你 BaseKlineManager 的 getSnapshot 还没加/或抛错，这里兜底 */
    private safeGetSnapshot(manager: BaseKlineManager): KlineSnapshot | null {
        try {
            // 你按前面建议加的：getSnapshot(): KlineSnapshot | null
            const snap = (manager as any).getSnapshot?.() as KlineSnapshot | null
            if (!snap) return null
            return snap
        } catch {
            return null
        }
    }

    /**
     * 级联策略（核心）：
     * - 4h 是方向层（L3）：broken => 全部不可交易
     * - 1h 是结构层（L2）：broken => 不可交易（但不要求你杀 5m/4h 的连接）
     * - 5m 是执行层（L1）：warning/broken => 冻结执行信号（默认 warning 也冻结，更保守）
     * - stale 检查：按周期 step 的倍数判断是否过期
     */
    private computePermission(input: {
        m5: KlineSnapshot | null
        h1: KlineSnapshot | null
        h4: KlineSnapshot | null
        now: number
    }): TradePermission {
        const { m5, h1, h4, now } = input

        // 1) ready / snapshot 必须齐
        if (!this.m5.isReady?.() || !this.h1.isReady?.() || !this.h4.isReady?.()) {
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
        const stale = this.checkStale({ m5, h1, h4, now })
        if (stale) return stale

        // 3) timeHealth 级联（核心）
        const h4Health: TimeHealth = (h4.timeHealth ?? 'healthy') as TimeHealth
        const h1Health: TimeHealth = (h1.timeHealth ?? 'healthy') as TimeHealth
        const m5Health: TimeHealth = (m5.timeHealth ?? 'healthy') as TimeHealth

        // L3：4h broken => 全部不可交易
        if (h4Health === 'broken') {
            return { allowed: false, reason: '4h_unhealthy', detail: '4h timeHealth=broken' }
        }
        if (h4Health === 'warning' && this.opts.allowH4Warning === false) {
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
            '1h': this.opts.staleBars['1h'] ?? 2,
            '4h': this.opts.staleBars['4h'] ?? 2,
        } satisfies Record<Interval, number>

        const checks: Array<{ s: KlineSnapshot; interval: Interval }> = [
            { s: m5, interval: '5m' },
            { s: h1, interval: '1h' },
            { s: h4, interval: '4h' },
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
}

// ===================== 使用示例 =====================
//
// const coordinator = new MultiTimeframeCoordinator(
//   eth5mManager,
//   eth1hManager,
//   eth4hManager,
//   {
//     symbol: 'ETHUSDT',
//     staleBars: { '5m': 2, '1h': 2, '4h': 2 },
//     allowM5Warning: false, // 保守：5m warning 也不交易
//     allowH1Warning: true,  // 1h warning 仍可交易（可按你经验调整）
//     allowH4Warning: true,  // 4h warning 仍可交易
//     pollMs: 1000,
//   }
// )
//
// coordinator.onStateChange((st) => {
//   // 给规则引擎 / GPT / 推送用
//   console.log('[Coordinator]', st.permission, {
//     m5: st.snapshots.m5?.closeTime,
//     h1: st.snapshots.h1?.closeTime,
//     h4: st.snapshots.h4?.closeTime,
//   })
// })
//
// coordinator.start()
