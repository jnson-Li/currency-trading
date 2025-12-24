import path from 'path'
import fs from 'fs'
import type { Kline, BinanceRawKline } from '@/types/market.js'
import { fetchBinancePage } from './binance-adapter.js'
import { iterateMonths, monthKey, monthRange } from './time.js'

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
}

// 计算 interval 对应的毫秒数（只写你现在用到的）
function intervalToMs(interval: string): number {
    switch (interval) {
        case '1m':
            return 60 * 1000
        case '5m':
            return 5 * 60 * 1000
        case '15m':
            return 15 * 60 * 1000
        case '1h':
            return 60 * 60 * 1000
        case '4h':
            return 4 * 60 * 60 * 1000
        case '1d':
            return 24 * 60 * 60 * 1000
        default:
            throw new Error(`Unsupported interval: ${interval}`)
    }
}

export class HistoricalDataStore {
    baseDir = path.resolve('data/historical')

    constructor(
        public options = {
            retry: 3,
            throttleMs: 1000,
        }
    ) {}

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

    private async fetchMonth(symbol: string, interval: string, monthTs: number): Promise<Kline[]> {
        const { start, end } = monthRange(monthTs)
        const file = this.file(symbol, interval, monthTs)

        const cached = this.read(file)
        if (cached && cached.length > 0) return cached

        console.log(`🌐 Fetching ${symbol} ${interval} ${monthKey(monthTs)}`)

        const limit = 1000
        const intervalMs = intervalToMs(interval)
        const pageMs = limit * intervalMs

        let cursor = start
        let klines: Kline[] = []

        const pageEnd = Math.min(cursor + pageMs, end)

        let raws: BinanceRawKline[] = []

        raws = await fetchBinancePage(symbol, interval, cursor, pageEnd)

        console.log('[ raws ] >', raws)
        if (!raws || raws.length === 0) {
            // ⚠️ 这里不能直接认为“没数据”，而是安全退出本月
            console.warn(`⚠️ empty response @ ${new Date(cursor).toISOString()}`)
        }

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

        klines.sort((a, b) => a.openTime - b.openTime)
        this.write(file, klines)

        console.log(`💾 Cached ${symbol} ${interval} ${monthKey(monthTs)} (${klines.length})`)

        return klines
    }

    // 🚀 对外唯一 API
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

        return result.sort((a, b) => a.openTime - b.openTime)
    }
}
