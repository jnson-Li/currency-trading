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

export interface BaseKlineSnapshot {
    symbol: string
    interval: Interval
    level: IntervalLevel

    lastKline: Kline

    ready: boolean
    cacheSize: number
    timeHealth: TimeHealth
    updatedAt: number
}

export interface AnalysisSnapshot {
    trend?: Trend
    structure?: Structure

    atr14?: number
    atrPct?: number

    emaFast?: number
    emaSlow?: number
    ema21?: number
    ema34?: number

    swing?: {
        lastHH?: number
        lastHL?: number
        lastLH?: number
        lastLL?: number
        high?: number
        low?: number
    }

    lastStructureChangeAt?: number
}

export interface ExecutionSnapshot {
    entry?: {
        breakout?: { long: boolean; short: boolean }
        pullback?: { long: boolean; short: boolean }
    }

    atrPct?: number
    wickRatio?: number
    bodyRatio?: number

    pending?: {
        structure: Structure
        count: number
    }

    legs?: {
        impulseAvg?: number
        pullbackAvg?: number
    }

    volSMA?: number
}

export interface KlineSnapshotData extends BaseKlineSnapshot, AnalysisSnapshot, ExecutionSnapshot {}

export type KlineSnapshot = KlineSnapshotData | null

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
