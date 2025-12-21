import { httpFetch } from '../infra/http.js'
import { stableFetch } from '@/infra/fetch.js'
import {
    BinanceRawKlines,
    BinanceRawKline,
    NewKlineParams,
    BiAnKlineParams,
} from '@/types/market.js'

export async function fetchNewKline(params: NewKlineParams) {
    const res = await fetch('https://api9528mystks.mystonks.org/api/v1/stockhome/newKline', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    })
    if (!res.ok) {
        throw new Error(`fetch newKline failed: ${res.status}`)
    }

    return res.json()
}
export async function fetchBiAnKline(params: BiAnKlineParams): Promise<BinanceRawKlines> {
    const query = new URLSearchParams(
        Object.entries(params).map(([key, value]) => [key, String(value)])
    ).toString()
    const res = await stableFetch(`https://api.binance.com/api/v3/klines?${query}`)
    if (!res.ok) {
        throw new Error(`fetch BAKline failed: ${res.status}`)
    }

    const data = (await res.json()) as BinanceRawKlines
    return data
}
