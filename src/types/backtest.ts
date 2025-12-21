// backtest/types.ts
import { TradeSignal } from './strategy.js'
export interface BacktestConfig {
    symbol: string

    // 回测时间范围
    startTime: number
    endTime: number

    // 资金 & 风控
    initialBalance: number
    riskPerTrade: number // 例如 0.01 = 1%

    // 交易假设
    feeRate: number // 例如 0.0004
    slippage: number // 例如 0.0002

    // 退出规则
    stopLossPct: number // 例如 0.01
    takeProfitPct: number // 例如 0.02

    // 执行周期
    executionInterval: '5m'
}

export type TradeOutcome = 'win' | 'loss' | 'breakeven'

export interface TradeResult {
    signal: TradeSignal

    entryPrice: number
    entryTime: number

    exitPrice: number
    exitTime: number

    side: 'long' | 'short'
    outcome: TradeOutcome

    pnl: number
    pnlPct: number

    maxFavorableExcursion: number // MFE
    maxAdverseExcursion: number // MAE
}
export interface BacktestSummary {
    totalTrades: number
    winRate: number

    totalPnL: number
    avgPnL: number

    maxDrawdown: number
    profitFactor: number

    avgHoldTimeMs: number
}

export interface BacktestReport {
    overview: {
        totalTrades: number
        winRate: number
        totalPnL: number
        avgPnL: number
        profitFactor: number
    }
    risk: {
        maxDrawdown: number
        maxMAE: number
        maxMFE: number
    }
    timing: {
        avgHoldMinutes: number
    }
}
