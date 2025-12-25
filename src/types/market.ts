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
    string // ignore
]

export type BinanceRawKlines = BinanceRawKline[]

// types/market.ts

export type Trend = 'bull' | 'bear' | 'range'
export type Structure = 'hh_hl' | 'lh_ll' | 'range'
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
export interface KlineSnapshot {
    symbol: string
    interval: Interval
    level: IntervalLevel

    // ===== 最新 K 线 =====
    lastOpen: number
    lastHigh: number
    lastLow: number
    lastClose: number
    lastVolume: number
    closeTime: number

    // ===== 系统状态 =====
    ready: boolean
    cacheSize: number
    timeHealth: TimeHealth
    updatedAt: number

    // ===== 分析状态（可选）=====
    trend?: Trend
    structure?: Structure
    volatility?: Volatility
    momentum?: Momentum

    // ===== 执行 / 确认层扩展 =====
    entry?: EntrySignal // 5m
    mid?: MidConfirmation // 15m

    atr14?: number
}
