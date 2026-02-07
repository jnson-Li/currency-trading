import { fetchBiAnKline } from '@/services/market.service.js';
export async function fetchBinancePage(symbol, interval, startTime, endTime) {
    return fetchBiAnKline({
        symbol,
        interval,
        limit: '1000',
        startTime,
        endTime,
    });
}
