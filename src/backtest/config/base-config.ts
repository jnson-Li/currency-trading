// backtest/config/base-config.ts
import type { BacktestConfig } from '@/types/backtest.js'

export const BASE_BACKTEST_CONFIG: Omit<BacktestConfig, 'startTime' | 'endTime'> = {
    symbol: 'ETHUSDT',

    initialBalance: 10_000,
    riskPerTrade: 0.01,

    feeRate: 0.0004,
    slippage: 0.0002,

    stopLossPct: 0.01,
    takeProfitPct: 0.02,

    executionInterval: '5m',
}
