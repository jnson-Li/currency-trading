// src/services/market.service.ts

import { NewKlineParams } from '../types/market.js'
export async function fetchNewKline(params: NewKlineParams) {
    const res = await fetch('https://api9528mystks.mystonks.org/api/v1/stockhome/newKline', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    })
    console.log('[ k线数据 ] >', res)
    if (!res.ok) {
        throw new Error(`fetch newKline failed: ${res.status}`)
    }

    return res.json()
}
