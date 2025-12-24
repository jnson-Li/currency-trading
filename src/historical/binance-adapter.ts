import type { BinanceRawKline } from '@/types/market.js'
import { fetchBiAnKline } from '@/services/market.service.js'

export async function fetchBinancePage(
    symbol: string,
    interval: string,
    startTime: number,
    endTime: number
): Promise<BinanceRawKline[]> {
    return fetchBiAnKline({
        symbol,
        interval,
        limit: '1000',
        startTime,
        endTime,
    })
}
