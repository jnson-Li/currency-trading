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
