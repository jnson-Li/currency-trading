// backtest/robustness.ts
import type { Kline } from '@/types/market.js'
import { runBacktest } from '@/backtest/backtest-runner.js'

function splitWalkForward<T>(arr: T[], parts: number) {
    const n = arr.length
    const size = Math.floor(n / parts)
    const chunks: T[][] = []
    for (let i = 0; i < parts; i++) {
        const start = i * size
        const end = i === parts - 1 ? n : (i + 1) * size
        chunks.push(arr.slice(start, end))
    }
    return chunks
}

export function runWalkForward(klines5m: Kline[], parts = 6) {
    const chunks = splitWalkForward(klines5m, parts)

    // 只做 OOS：第 i 段当验证，前面所有段当“已发生历史”（不做调参也行）
    const reports = []
    for (let i = 2; i < chunks.length; i++) {
        const oos = chunks[i]
        const results = runBacktest(oos)
        reports.push({ part: i, trades: results.length })
    }
    return reports
}

export function sanityChecks(results: any[]) {
    // ✅ 最低交易次数门槛：太少的交易次数很容易“看起来很美”
    const minTrades = 30
    const okTrades = results.length >= minTrades
    return { okTrades, trades: results.length }
}
