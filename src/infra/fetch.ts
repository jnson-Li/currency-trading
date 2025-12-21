// src/network/fetch.ts
import { fetch, RequestInit, Dispatcher } from 'undici'
import { proxyAgent } from './proxy.js'

export interface StableFetchOptions extends RequestInit {
    timeoutMs?: number
    retries?: number
    retryDelayMs?: number
}

function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms))
}

function isRetryableError(err: any) {
    const msg = err?.message || ''
    return (
        msg.includes('fetch failed') ||
        msg.includes('TLS') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('socket disconnected')
    )
}

export async function stableFetch(url: string, options: StableFetchOptions = {}) {
    const { timeoutMs = 10_000, retries = 3, retryDelayMs = 800, ...rest } = options

    let lastError: any

    for (let attempt = 1; attempt <= retries; attempt++) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs)

        try {
            const res = await fetch(url, {
                ...rest,
                signal: controller.signal,
                dispatcher: proxyAgent as Dispatcher | undefined,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    ...rest.headers,
                },
            })

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`)
            }

            return res
        } catch (err) {
            lastError = err

            if (!isRetryableError(err) || attempt === retries) {
                break
            }

            // 指数退避
            const delay = retryDelayMs * attempt
            await sleep(delay)
        } finally {
            clearTimeout(timeout)
        }
    }

    throw lastError
}
