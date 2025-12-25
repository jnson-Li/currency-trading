// src/historical/HistoricalDataStore.ts
import path from 'path'
import fs from 'fs'
import { Agent, Dispatcher } from 'undici'
import type { Kline, BinanceRawKline } from '@/types/market.js'
import { fetchBiAnKline } from '@/services/market.service.js'
import { iterateMonths, monthKey, monthRange } from './time.js'

/* =======================
   网络层（Binance 专用）
======================= */

const binanceAgent = new Agent({
    connect: {
        family: 4, // ✅ 强制 IPv4（解决 IPv6 timeout）
    },
    connectTimeout: 30_000,
    keepAliveTimeout: 60_000,
})

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}

/* =======================
   时间 & 分页工具
======================= */

function intervalMs(interval: string): number {
    switch (interval) {
        case '1m':
            return 60_000
        case '5m':
            return 5 * 60_000
        case '15m':
            return 15 * 60_000
        case '1h':
            return 60 * 60_000
        default:
            throw new Error(`Unsupported interval: ${interval}`)
    }
}

function pageWindowMs(interval: string, limit = 1000) {
    return intervalMs(interval) * limit
}

/* =======================
   数据完整性校验
======================= */

function verifyContinuity(klines: Kline[], interval: string, startTime: number, endTime: number) {
    if (klines.length === 0) {
        throw new Error('❌ No klines returned')
    }

    const step = intervalMs(interval)

    if (klines[0].openTime > startTime + step) {
        throw new Error(
            `❌ Data does not cover startTime: ${new Date(klines[0].openTime).toISOString()}`
        )
    }

    if (klines[klines.length - 1].closeTime < endTime - step) {
        throw new Error(
            `❌ Data does not cover endTime: ${new Date(
                klines[klines.length - 1].closeTime
            ).toISOString()}`
        )
    }

    for (let i = 1; i < klines.length; i++) {
        const prev = klines[i - 1]
        const cur = klines[i]

        if (cur.openTime - prev.openTime !== step) {
            throw new Error(
                `❌ Missing kline between ${new Date(prev.openTime).toISOString()} and ${new Date(
                    cur.openTime
                ).toISOString()}`
            )
        }
    }
}

/* =======================
   HistoricalDataStore
======================= */

export class HistoricalDataStore {
    baseDir = path.resolve('data/historical')

    constructor(
        public options = {
            retry: 4,
            throttleMs: 800,
        }
    ) {}

    /* ---------- 文件 ---------- */

    private file(symbol: string, interval: string, monthTs: number) {
        return path.join(this.baseDir, symbol, interval, `${monthKey(monthTs)}.json`)
    }

    private read(file: string): Kline[] | null {
        if (!fs.existsSync(file)) return null
        return JSON.parse(fs.readFileSync(file, 'utf-8'))
    }

    private write(file: string, data: Kline[]) {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, JSON.stringify(data))
    }

    /* ---------- 拉一个月 ---------- */

    private async fetchMonth(symbol: string, interval: string, monthTs: number): Promise<Kline[]> {
        const { start, end } = monthRange(monthTs)
        const file = this.file(symbol, interval, monthTs)

        const cached = this.read(file)
        if (cached && cached.length > 0) return cached

        console.log(`🌐 Fetching ${symbol} ${interval} ${monthKey(monthTs)}`)

        const windowMs = pageWindowMs(interval)
        let cursor = start
        const klines: Kline[] = []

        while (cursor < end) {
            const pageEnd = Math.min(cursor + windowMs, end)
            let raws: BinanceRawKline[] = []

            for (let i = 1; i <= this.options.retry; i++) {
                try {
                    raws = await fetchBiAnKline({
                        symbol,
                        interval,
                        limit: 1000,
                        startTime: cursor,
                        endTime: pageEnd,
                    })
                    break
                } catch (e) {
                    console.warn(
                        `⚠️ retry ${i}/${this.options.retry} @ ${new Date(cursor).toISOString()}`
                    )
                    await sleep(1000 * i)
                }
            }

            if (!raws || raws.length === 0) break

            for (const r of raws) {
                klines.push({
                    openTime: r[0],
                    open: Number(r[1]),
                    high: Number(r[2]),
                    low: Number(r[3]),
                    close: Number(r[4]),
                    volume: Number(r[5]),
                    closeTime: r[6],
                })
            }

            cursor = raws[raws.length - 1][6] + 1
            await sleep(this.options.throttleMs)
        }

        klines.sort((a, b) => a.openTime - b.openTime)
        this.write(file, klines)

        console.log(`💾 Cached ${symbol} ${interval} ${monthKey(monthTs)} (${klines.length})`)
        return klines
    }

    /* ---------- 对外唯一 API ---------- */

    async getKlines(
        symbol: string,
        interval: string,
        startTime: number,
        endTime: number
    ): Promise<Kline[]> {
        const months = iterateMonths(startTime, endTime)
        const result: Kline[] = []

        for (const m of months) {
            const data = await this.fetchMonth(symbol, interval, m)
            for (const k of data) {
                if (k.openTime >= startTime && k.closeTime <= endTime) {
                    result.push(k)
                }
            }
        }

        result.sort((a, b) => a.openTime - b.openTime)

        // ✅ 完整性校验
        // verifyContinuity(result, interval, startTime, endTime)

        console.log(`✅ Data verified: ${symbol} ${interval} (${result.length} bars)`)

        return result
    }
}
