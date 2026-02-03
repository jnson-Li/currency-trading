// src/debug/reject-stats.ts
import type { RejectReason } from '@/strategy/strategy-engine.js'

type Key = string

export interface RejectStatsOptions {
    /** 多久输出一次汇总（ms），默认 60s */
    flushIntervalMs?: number
    /** 输出 topN，默认 10 */
    topN?: number
    /** meta 示例保留多少条（每个 code），默认 2 */
    samplePerKey?: number
    /** 自定义 logger */
    logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

type Bucket = {
    count: number
    lastAt: number
    last: RejectReason | null
    samples: any[]
}

export class RejectStats {
    private opts: Required<RejectStatsOptions>
    private timer: NodeJS.Timeout | null = null

    private startedAt = Date.now()

    private totalEvaluations = 0
    private totalSignals = 0
    private totalRejects = 0

    private buckets = new Map<Key, Bucket>()

    constructor(opts?: RejectStatsOptions) {
        this.opts = {
            flushIntervalMs: opts?.flushIntervalMs ?? 60_000,
            topN: opts?.topN ?? 10,
            samplePerKey: opts?.samplePerKey ?? 2,
            logger: opts?.logger ?? console,
        }
    }

    /** 每次 evaluate 结束都调用一次：signal 为真则记 signal，否则可传 reject */
    record(input: { signalEmitted: boolean; reject?: RejectReason | null }) {
        this.totalEvaluations += 1

        if (input.signalEmitted) {
            this.totalSignals += 1
            return
        }

        // 没出信号才记 reject
        const r = input.reject
        if (!r) return

        this.totalRejects += 1
        const key = this.keyOf(r)

        const b = this.buckets.get(key) ?? {
            count: 0,
            lastAt: 0,
            last: null,
            samples: [],
        }

        b.count += 1
        b.lastAt = r.at ?? Date.now()
        b.last = r

        // 采样：保存 meta 样例，方便看阈值/数值分布
        if (b.samples.length < this.opts.samplePerKey) {
            b.samples.push({
                at: b.lastAt,
                code: r.code,
                stage: r.stage,
                detail: r.detail,
                meta: r.meta,
            })
        }

        this.buckets.set(key, b)
    }

    start() {
        if (this.timer) return
        this.timer = setInterval(() => this.flush(), this.opts.flushIntervalMs)
        // 不阻止进程退出
        ;(this.timer as any).unref?.()
    }

    stop() {
        if (!this.timer) return
        clearInterval(this.timer)
        this.timer = null
    }

    flush() {
        const now = Date.now()
        const upSec = Math.max(1, Math.floor((now - this.startedAt) / 1000))

        const { totalEvaluations, totalSignals, totalRejects } = this

        const signalRate = totalEvaluations > 0 ? totalSignals / totalEvaluations : 0
        const rejectRate = totalEvaluations > 0 ? totalRejects / totalEvaluations : 0

        // topN 排序
        const entries = Array.from(this.buckets.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, this.opts.topN)

        this.opts.logger.info?.('[reject-stats]', {
            uptimeSec: upSec,
            totalEvaluations,
            totalSignals,
            totalRejects,
            signalRate: round(signalRate, 4),
            rejectRate: round(rejectRate, 4),
            uniqueRejectKeys: this.buckets.size,
        })

        for (const [key, b] of entries) {
            const pct = totalRejects > 0 ? b.count / totalRejects : 0
            this.opts.logger.info?.('  -', {
                key,
                count: b.count,
                pctOfRejects: round(pct, 4),
                lastAt: new Date(b.lastAt).toISOString(),
                last: b.last
                    ? {
                          stage: b.last.stage,
                          code: b.last.code,
                          detail: b.last.detail,
                      }
                    : null,
                samples: b.samples,
            })
        }
    }

    reset() {
        this.startedAt = Date.now()
        this.totalEvaluations = 0
        this.totalSignals = 0
        this.totalRejects = 0
        this.buckets.clear()
    }

    snapshot() {
        return {
            startedAt: this.startedAt,
            totalEvaluations: this.totalEvaluations,
            totalSignals: this.totalSignals,
            totalRejects: this.totalRejects,
            buckets: Array.from(this.buckets.entries()).map(([key, b]) => ({
                key,
                count: b.count,
                lastAt: b.lastAt,
                last: b.last,
                samples: b.samples,
            })),
        }
    }

    private keyOf(r: RejectReason): Key {
        // stage + code 足够区分
        return `${r.stage}:${r.code}`
    }
}

function round(x: number, d: number) {
    const p = Math.pow(10, d)
    return Math.round(x * p) / p
}
