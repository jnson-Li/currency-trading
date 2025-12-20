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
