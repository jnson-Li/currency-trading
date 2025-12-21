// backtest/summary.ts
import type { TradeResult, BacktestReport } from '@/types/backtest.js'

export function summarizeBacktest(results: TradeResult[]): BacktestReport {
    if (results.length === 0) {
        return {
            overview: {
                totalTrades: 0,
                winRate: 0,
                totalPnL: 0,
                avgPnL: 0,
                profitFactor: 0,
            },
            risk: {
                maxDrawdown: 0,
                maxMAE: 0,
                maxMFE: 0,
            },
            timing: {
                avgHoldMinutes: 0,
            },
        }
    }

    let wins = 0
    let grossProfit = 0
    let grossLoss = 0

    let equity = 0
    let peakEquity = 0
    let maxDD = 0

    let totalHoldMs = 0
    let maxMAE = 0
    let maxMFE = 0

    for (const t of results) {
        equity += t.pnl
        peakEquity = Math.max(peakEquity, equity)
        maxDD = Math.max(maxDD, peakEquity - equity)

        if (t.pnl > 0) {
            wins++
            grossProfit += t.pnl
        } else {
            grossLoss += Math.abs(t.pnl)
        }

        totalHoldMs += t.exitTime - t.entryTime
        maxMAE = Math.max(maxMAE, t.maxAdverseExcursion)
        maxMFE = Math.max(maxMFE, t.maxFavorableExcursion)
    }

    const totalTrades = results.length
    const winRate = wins / totalTrades
    const totalPnL = equity
    const avgPnL = totalPnL / totalTrades
    const profitFactor = grossLoss === 0 ? Infinity : grossProfit / grossLoss

    return {
        overview: {
            totalTrades,
            winRate: Number(winRate.toFixed(3)),
            totalPnL: Number(totalPnL.toFixed(2)),
            avgPnL: Number(avgPnL.toFixed(2)),
            profitFactor: Number(profitFactor.toFixed(2)),
        },
        risk: {
            maxDrawdown: Number(maxDD.toFixed(2)),
            maxMAE: Number(maxMAE.toFixed(2)),
            maxMFE: Number(maxMFE.toFixed(2)),
        },
        timing: {
            avgHoldMinutes: Math.round(totalHoldMs / totalTrades / 60_000),
        },
    }
}
