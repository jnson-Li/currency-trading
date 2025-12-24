// src/backtest/run-stability.ts
import { splitByMonths } from './slicing.js'
import { runBacktest } from './backtest-runner.js'
import { summarizeBacktest } from './summary.js'
import { scoreSlice } from './stability/score.js'
import { buildStabilityTable } from './stability/stability-table.js'
import { BASE_BACKTEST_CONFIG } from './config/base-config.js'

// 🔁 新增：统一历史数据仓库
import { HistoricalDataStore } from '@/historical/HistoricalDataStore.js'

async function main() {
    console.log('▶ Running stability test (6 months, monthly slices)...')

    const now = Date.now()
    const start = new Date(now)
    start.setMonth(start.getMonth() - 6)

    const slices = splitByMonths(start.getTime(), now, 1)

    const rows = []

    // 🔁 全局只创建一次
    const store = new HistoricalDataStore({
        retry: 3,
        throttleMs: 300,
    })

    for (const s of slices) {
        console.log(`📊 Slice ${new Date(s.start).toISOString().slice(0, 7)}`)

        // 🔁 用 store 替代 loadHistorical5m
        const klines = await store.getKlines('ETHUSDT', '5m', s.start, s.end)

        const results = await runBacktest(klines, {
            ...BASE_BACKTEST_CONFIG,
            startTime: s.start,
            endTime: s.end,
        })

        const report = summarizeBacktest(results)
        const score = scoreSlice(report)

        rows.push({
            slice: new Date(s.start).toISOString().slice(0, 7),
            score: score.total,
        })
    }

    console.table(rows)

    const summary = buildStabilityTable(rows)
    console.log('▶ STABILITY SUMMARY')
    console.log(summary)

    if (summary.verdict === 'unstable') {
        console.log('❌ Strategy is NOT suitable for live trading')
        process.exit(2)
    } else {
        console.log('✅ Strategy passed stability check')
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
