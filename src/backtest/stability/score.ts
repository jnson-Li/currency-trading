// backtest/stability/score.ts
import type { BacktestReport } from '@/types/backtest.js'

function scoreWinRate(wr: number) {
    if (wr < 0.4) return 20
    if (wr < 0.5) return 50
    if (wr < 0.6) return 80
    return 100
}

function scorePF(pf: number) {
    if (pf < 1.0) return 0
    if (pf < 1.2) return 40
    if (pf < 1.5) return 70
    return 100
}

function scoreDD(ddPct: number) {
    if (ddPct > 0.3) return 0
    if (ddPct > 0.2) return 40
    if (ddPct > 0.1) return 70
    return 100
}

function scoreTrades(n: number) {
    if (n < 10) return 0
    if (n < 30) return 50
    return 100
}

export function scoreSlice(report: BacktestReport) {
    const wrScore = scoreWinRate(report.overview.winRate)
    const pfScore = scorePF(report.overview.profitFactor)
    const ddScore = scoreDD(
        report.risk.maxDrawdown / Math.max(1, Math.abs(report.overview.totalPnL))
    )
    const tradeScore = scoreTrades(report.overview.totalTrades)

    const total = 0.3 * wrScore + 0.3 * pfScore + 0.25 * ddScore + 0.15 * tradeScore

    return {
        total: Math.round(total),
        breakdown: {
            wrScore,
            pfScore,
            ddScore,
            tradeScore,
        },
    }
}
