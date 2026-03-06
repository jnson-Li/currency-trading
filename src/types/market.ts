export interface NewKlineParams {
    symbol: string
    kType: string
    sType: number
    pageIndex: number
    pageSize: number
}
export interface BiAnKlineParams {
    symbol: string
    interval: string
    limit: number | string
    startTime?: number | string
    endTime?: number | string
}

export interface Kline {
    openTime: number
    closeTime: number
    open: number
    high: number
    low: number
    close: number
    volume: number
}
// Binance 原始返回结构
export type BinanceRawKline = [
    number, // openTime
    string, // open
    string, // high
    string, // low
    string, // close
    string, // volume
    number, // closeTime
    string, // quoteAssetVolume
    number, // numberOfTrades
    string, // takerBuyBaseVolume
    string, // takerBuyQuoteVolume
    string, // ignore
]

export type BinanceRawKlines = BinanceRawKline[]

// types/market.ts

export type Trend = 'bull' | 'bear' | 'range' | null
export type Structure = 'hh_hl' | 'lh_ll' | 'range' | null
export type Momentum = 'up' | 'down'
export type Volatility = 'low' | 'normal' | 'high'

export type TimeHealth = 'healthy' | 'warning' | 'broken'

export type Interval = '5m' | '15m' | '1h' | '4h'

export type IntervalLevel = 'L1' | 'L2' | 'L3'

/**
 * ===== 5m 执行层入场信号 =====
 */
export interface EntrySignal {
    breakout?: { long: boolean; short: boolean }
    pullback?: { long: boolean; short: boolean }
}

/**
 * ===== 15m 次级确认层 =====
 */
export interface MidConfirmation {
    trend?: Trend
    structure?: Structure
}

/**
 * ===== 核心 Snapshot =====
 */

export interface BaseKlineSnapshot<I extends Interval = Interval> {
    symbol: string
    interval: I
    level: IntervalLevel

    lastKline: Kline
    lastConfirmedCloseTime?: number

    ready: boolean
    cacheSize: number
    timeHealth: TimeHealth

    trend: Trend
    structure: Structure

    updatedAt: number
}

export interface BaseExecutionSnapshot {
    atr14: number | undefined
    atrPct: number | undefined
}
export interface ExecutionSnapshot5m extends BaseExecutionSnapshot {
    emaFast: number | undefined
    emaSlow: number | undefined
    atrPctSMA: number | undefined
    volSMA: number | undefined
    wickRatio: number | undefined

    swing: {
        high: number | undefined
        low: number | undefined
    }

    entry: {
        breakout: { long: boolean; short: boolean }
        pullback: { long: boolean; short: boolean }
    }
}
export interface ExecutionSnapshot15m extends BaseExecutionSnapshot {
    ema21: number | undefined
    wickRatio: number | undefined
    bodyRatio: number | undefined

    swing: {
        high: number | undefined
        low: number | undefined
    }

    pending: {
        structure: Structure
        count: number
    }
    lastStructureChangeAt: number | undefined
}
export interface ExecutionSnapshot1h extends BaseExecutionSnapshot {
    ema21: number | undefined

    swing: {
        lastHH: number | undefined
        lastHL: number | undefined
        lastLH: number | undefined
        lastLL: number | undefined
    }

    pending: {
        structure: Structure
        count: number
    }
    lastStructureChangeAt: number | undefined
}
export interface ExecutionSnapshot4h extends BaseExecutionSnapshot {
    ema34: number | undefined

    swing: {
        lastHH: number | undefined
        lastHL: number | undefined
        lastLH: number | undefined
        lastLL: number | undefined
    }
    legs?: {
        impulseAvg?: number
        pullbackAvg?: number
    }
    pending: {
        structure: Structure
        count: number
    }
    lastStructureChangeAt: number | undefined
}

export type SnapshotExtraMap = {
    '5m': ExecutionSnapshot5m | null
    '15m': ExecutionSnapshot15m | null
    '1h': ExecutionSnapshot1h | null
    '4h': ExecutionSnapshot4h | null
    // 未来：'1d': ExecutionSnapshot1d ...
}

export type KlineSnapshotData<I extends keyof SnapshotExtraMap = keyof SnapshotExtraMap> =
    BaseKlineSnapshot<I> & SnapshotExtraMap[I]

export type KlineSnapshot = KlineSnapshotData | null

export type CoordinatorSnapshots = {
    '5m': KlineSnapshotData<'5m'> | null
    '15m': KlineSnapshotData<'15m'> | null
    '1h': KlineSnapshotData<'1h'> | null
    '4h': KlineSnapshotData<'4h'> | null
}

import type {
    ETH5mKlineManager,
    ETH15mKlineManager,
    ETH1hKlineManager,
    ETH4hKlineManager,
} from '@/managers/index.js'

export type Managers = {
    m5: ETH5mKlineManager
    m15: ETH15mKlineManager
    h1: ETH1hKlineManager
    h4: ETH4hKlineManager
}
