// backtest/run.ts
import { runBacktest } from './backtest-runner.js'
import { getLast6MonthsWindow } from './time-window.js'
import { summarizeBacktest } from './summary.js'
import { loadHistorical5m } from './data-loader.js'
import { BASE_BACKTEST_CONFIG } from './config/base-config.js'
async function main() {
    const { startTime, endTime } = getLast6MonthsWindow()

    const klines5m = await loadHistorical5m('ETHUSDT', startTime, endTime)

    const results = await runBacktest(klines5m, {
        symbol: 'ETHUSDT',
        startTime,
        endTime,
        initialBalance: 10_000,
        riskPerTrade: 0.01,
        feeRate: 0.0004,
        slippage: 0.0002,
        stopLossPct: 0.01,
        takeProfitPct: 0.02,
        executionInterval: '5m',
    })

    const report = summarizeBacktest(results)

    console.log('===== BACKTEST REPORT (LAST 6 MONTHS) =====')
    console.table(report.overview)
    console.table(report.risk)
    console.table(report.timing)
}

main().catch(console.error)
