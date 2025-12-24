// src/backtest/run-sliced.ts
import { splitByMonths } from './slicing.js'
import { runBacktest } from './backtest-runner.js'
import { summarizeBacktest } from './summary.js'
import { BASE_BACKTEST_CONFIG } from './config/base-config.js'

// 🔁 新增：统一历史数据仓库
import { HistoricalDataStore } from '@/historical/HistoricalDataStore.js'

async function main() {
    console.log('▶ Running sliced backtest (monthly slices)...')

    const now = Date.now()
    const start = new Date(now)
    start.setMonth(start.getMonth() - 6)

    const slices = splitByMonths(start.getTime(), now, 1)

    // 🔁 全局只创建一次
    const store = new HistoricalDataStore({
        retry: 3,
        throttleMs: 300,
    })

    for (const s of slices) {
        const label = new Date(s.start).toISOString().slice(0, 7)
        console.log(`📊 Slice ${label}`)

        // 🔁 用 store 替代 loadHistorical5m
        const klines = await store.getKlines('ETHUSDT', '5m', s.start, s.end)

        const results = await runBacktest(klines, {
            ...BASE_BACKTEST_CONFIG,
            startTime: s.start,
            endTime: s.end,
        })

        const report = summarizeBacktest(results)

        console.log(`[${label}]`, report.overview)
    }

    console.log('✓ Sliced backtest finished')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
