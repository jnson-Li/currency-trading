// src/debug/reject-stats-file.ts
import fs from 'node:fs'
import path from 'node:path'
import type { RejectReason } from '@/strategy/strategy-engine.js'

type Key = string

export interface RejectStatsFileOptions {
    /** 事件文件：每次 reject 记录一条（jsonl） */
    eventFile: string
    /** 汇总文件：每次 flush 记录一条（jsonl） */
    summaryFile: string

    /** 每多少次 evaluate flush 一次（推荐：12=1小时、24=2小时） */
    flushEveryNEvals?: number
    /** 每隔多久 flush 一次（ms），0 表示关闭时间触发 */
    flushIntervalMs?: number

    /** topN 输出 */
    topN?: number
    /** 每个 key 存多少条 meta 样例 */
    samplePerKey?: number

    /** 是否把 signal（成功）也记到 eventFile（一般没必要） */
    writeSignalEvents?: boolean

    logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

type Bucket = {
    count: number
    lastAt: number
    last: RejectReason | null
    samples: any[]
}

export class RejectStatsFile {
    private opts: Required<Omit<RejectStatsFileOptions, 'logger'>> & {
        logger: RejectStatsFileOptions['logger']
    }
    private timer: NodeJS.Timeout | null = null
    private startedAt = Date.now()

    private totalEvaluations = 0
    private totalSignals = 0
    private totalRejects = 0

    private buckets = new Map<Key, Bucket>()
    private lastFlushAt = 0

    constructor(opts: RejectStatsFileOptions) {
        const flushEveryNEvals = opts.flushEveryNEvals ?? 12
        const flushIntervalMs = opts.flushIntervalMs ?? 60 * 60 * 1000 // 默认 60分钟
        const topN = opts.topN ?? 10
        const samplePerKey = opts.samplePerKey ?? 2
        const writeSignalEvents = opts.writeSignalEvents ?? false

        this.opts = {
            eventFile: opts.eventFile,
            summaryFile: opts.summaryFile,
            flushEveryNEvals,
            flushIntervalMs,
            topN,
            samplePerKey,
            writeSignalEvents,
            logger: opts.logger ?? console,
        }

        ensureDir(this.opts.eventFile)
        ensureDir(this.opts.summaryFile)
    }

    start() {
        if (this.timer) return
        if (this.opts.flushIntervalMs > 0) {
            this.timer = setInterval(() => this.flush('interval'), this.opts.flushIntervalMs)
            ;(this.timer as any).unref?.()
        }
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    /**
     * 每次 evaluate 后调用
     */
    record(input: {
        signalEmitted: boolean
        reject?: RejectReason | null
        meta?: Record<string, any> // 你想附加的额外上下文
    }) {
        const now = Date.now()
        this.totalEvaluations += 1

        if (input.signalEmitted) {
            this.totalSignals += 1
            if (this.opts.writeSignalEvents) {
                this.appendJsonl(this.opts.eventFile, {
                    ts: now,
                    type: 'signal',
                    ...input.meta,
                })
            }
        } else {
            const r = input.reject
            if (r) {
                this.totalRejects += 1

                // 1) 写入单条 reject event（强烈建议）
                this.appendJsonl(this.opts.eventFile, {
                    ts: now,
                    type: 'reject',
                    stage: r.stage,
                    code: r.code,
                    detail: r.detail,
                    at: r.at,
                    meta: r.meta,
                    ...input.meta,
                })

                // 2) 更新内存统计桶
                const key = this.keyOf(r)
                const b = this.buckets.get(key) ?? { count: 0, lastAt: 0, last: null, samples: [] }

                b.count += 1
                b.lastAt = r.at ?? now
                b.last = r

                if (b.samples.length < this.opts.samplePerKey) {
                    b.samples.push({
                        at: b.lastAt,
                        stage: r.stage,
                        code: r.code,
                        detail: r.detail,
                        meta: r.meta,
                    })
                }

                this.buckets.set(key, b)
            }
        }

        // eval 次数触发 flush（更贴合你 5m 触发频率）
        if (
            this.opts.flushEveryNEvals > 0 &&
            this.totalEvaluations % this.opts.flushEveryNEvals === 0
        ) {
            this.flush('evals')
        } else {
            // 避免 timer 关闭时永不 flush：可选（很轻）
            // this.maybeFlushByTime(now)
        }
    }

    flush(reason: 'evals' | 'interval' | 'manual' = 'manual') {
        const now = Date.now()
        // 防止过于频繁重复 flush（比如 evals + interval 刚好撞车）
        if (this.lastFlushAt && now - this.lastFlushAt < 2_000) return
        this.lastFlushAt = now

        const upSec = Math.max(1, Math.floor((now - this.startedAt) / 1000))
        const signalRate = this.totalEvaluations > 0 ? this.totalSignals / this.totalEvaluations : 0
        const rejectRate = this.totalEvaluations > 0 ? this.totalRejects / this.totalEvaluations : 0

        const top = Array.from(this.buckets.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, this.opts.topN)
            .map(([key, b]) => {
                const pct = this.totalRejects > 0 ? b.count / this.totalRejects : 0
                return {
                    key,
                    count: b.count,
                    pctOfRejects: round(pct, 4),
                    lastAt: b.lastAt ? new Date(b.lastAt).toISOString() : null,
                    last: b.last
                        ? { stage: b.last.stage, code: b.last.code, detail: b.last.detail }
                        : null,
                    samples: b.samples,
                }
            })

        const summary = {
            ts: now,
            reason,
            uptimeSec: upSec,
            totalEvaluations: this.totalEvaluations,
            totalSignals: this.totalSignals,
            totalRejects: this.totalRejects,
            signalRate: round(signalRate, 4),
            rejectRate: round(rejectRate, 4),
            uniqueRejectKeys: this.buckets.size,
            top,
        }

        this.appendJsonl(this.opts.summaryFile, summary)
        this.opts.logger?.info?.('[reject-summary]', {
            reason,
            totalEvaluations: summary.totalEvaluations,
            totalSignals: summary.totalSignals,
            totalRejects: summary.totalRejects,
            signalRate: summary.signalRate,
            top0: top[0]?.key,
        })
    }

    reset() {
        this.startedAt = Date.now()
        this.totalEvaluations = 0
        this.totalSignals = 0
        this.totalRejects = 0
        this.buckets.clear()
        this.lastFlushAt = 0
    }

    private keyOf(r: RejectReason): Key {
        return `${r.stage}:${r.code}`
    }

    private appendJsonl(file: string, obj: any) {
        fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8')
    }
}

function ensureDir(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
}

function round(x: number, d: number) {
    const p = Math.pow(10, d)
    return Math.round(x * p) / p
}
