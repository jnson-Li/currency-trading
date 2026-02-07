console.log('[load] data-loader.ts');
import path from 'path';
import { fetchBiAnKline } from '../services/market.service.js';
import { readJsonCache, writeJsonCache } from './cache.js';
function formatDate(ts) {
    return new Date(ts).toISOString().slice(0, 10);
}
function getCacheFile(symbol, interval, startTime, endTime) {
    const base = path.resolve('data/historical');
    return path.join(base, symbol, interval, `${formatDate(startTime)}_${formatDate(endTime)}.json`);
}
/**
 * 加载 ETH 5m 历史 K 线（带本地缓存）
 */
export async function loadHistorical5m(symbol, startTime, endTime) {
    const interval = '5m';
    const cacheFile = getCacheFile(symbol, interval, startTime, endTime);
    // 1️⃣ 先读缓存
    const cached = readJsonCache(cacheFile);
    if (cached && cached.length > 0) {
        console.log(`📦 Loaded cached ${symbol} ${interval} (${cached.length} bars)`);
        return cached;
    }
    console.log(`🌐 Fetching ${symbol} ${interval} from Binance...`);
    // 2️⃣ 拉 Binance
    const limit = 1000;
    let klines = [];
    let cursor = startTime;
    while (cursor < endTime) {
        const raws = await fetchBiAnKline({
            symbol,
            interval,
            limit,
            startTime: cursor,
            endTime,
        });
        if (!raws || raws.length === 0)
            break;
        for (const raw of raws) {
            const k = {
                openTime: raw[0],
                open: Number(raw[1]),
                high: Number(raw[2]),
                low: Number(raw[3]),
                close: Number(raw[4]),
                volume: Number(raw[5]),
                closeTime: raw[6],
            };
            if (k.closeTime <= endTime) {
                klines.push(k);
            }
        }
        cursor = raws[raws.length - 1][6] + 1;
        if (raws.length < limit)
            break;
    }
    klines.sort((a, b) => a.openTime - b.openTime);
    // 3️⃣ 写缓存
    writeJsonCache(cacheFile, klines);
    console.log(`💾 Cached ${symbol} ${interval} (${klines.length} bars)`);
    return klines;
}
