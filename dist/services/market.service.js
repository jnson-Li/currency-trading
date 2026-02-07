import { stableFetch } from '@/infra/fetch.js';
export async function fetchNewKline(params) {
    const res = await fetch('https://api9528mystks.mystonks.org/api/v1/stockhome/newKline', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
    });
    if (!res.ok) {
        throw new Error(`fetch newKline failed: ${res.status}`);
    }
    return res.json();
}
export async function fetchBiAnKline(params) {
    const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    const url = `https://api.binance.com/api/v3/klines?${query}`;
    try {
        const res = await stableFetch(url);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json());
    }
    catch (e) {
        console.error('[fetchBiAnKline failed]', {
            url,
            error: e?.name || e,
        });
        throw e;
    }
}
