// src/network/fetch.ts
import { fetch } from 'undici';
import { httpProxyAgent } from './proxy.js';
function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}
function isAbortError(err) {
    return err?.name === 'AbortError' || String(err?.message).includes('aborted');
}
function isRetryableNetworkError(err) {
    const msg = String(err?.message || '');
    return (isAbortError(err) ||
        msg.includes('fetch failed') ||
        msg.includes('TLS') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('socket disconnected'));
}
function isRetryableHttpStatus(status) {
    // Binance / Cloudflare 常见
    return status === 418 || status === 429 || status >= 500;
}
export async function stableFetch(url, options = {}) {
    const { timeoutMs = 30_000, // ⬅️ 对 Binance 友好
    retries = 4, retryDelayMs = 1_000, ...rest } = options;
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                ...rest,
                signal: controller.signal,
                dispatcher: httpProxyAgent,
                headers: {
                    'User-Agent': 'Mozilla/5.0 BinanceFetcher',
                    Accept: 'application/json',
                    ...rest.headers,
                },
            });
            if (!res.ok) {
                // HTTP 错误单独处理
                if (isRetryableHttpStatus(res.status) && attempt < retries) {
                    lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
                }
                else {
                    throw new Error(`HTTP ${res.status} ${res.statusText}`);
                }
            }
            else {
                return res;
            }
        }
        catch (err) {
            lastError = err;
            const retryable = isRetryableNetworkError(err) ||
                (err?.message?.startsWith('HTTP') && attempt < retries);
            if (!retryable || attempt === retries) {
                break;
            }
            // ⏳ 指数退避 + 抖动
            const backoff = retryDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 300);
            console.warn(`[stableFetch] retry ${attempt}/${retries} after ${backoff}ms`, err?.name || err);
            await sleep(backoff);
        }
        finally {
            clearTimeout(timeout);
        }
    }
    throw lastError;
}
