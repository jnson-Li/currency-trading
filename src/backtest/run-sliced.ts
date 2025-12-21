// src/backtest/run-sliced.ts
import { splitByMonths } from './slicing.js'
import { runBacktest } from './backtest-runner.js'
import { summarizeBacktest } from './summary.js'
import { loadHistorical5m } from './data-loader.js'
import { BASE_BACKTEST_CONFIG } from './config/base-config.js'

async function main() {
    console.log('▶ Running sliced backtest (monthly slices)...')

    const now = Date.now()
    const start = new Date(now)
    start.setMonth(start.getMonth() - 6)

    const slices = splitByMonths(start.getTime(), now, 1)

    for (const s of slices) {
        const klines = await loadHistorical5m('ETHUSDT', s.start, s.end)

        const results = await runBacktest(klines, {
            ...BASE_BACKTEST_CONFIG,
            startTime: s.start,
            endTime: s.end,
        })

        const report = summarizeBacktest(results)

        console.log(`[${new Date(s.start).toISOString().slice(0, 7)}]`, report.overview)
    }

    console.log('✓ Sliced backtest finished')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
