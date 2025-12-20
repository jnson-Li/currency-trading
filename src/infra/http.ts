import { fetch } from 'undici'
import { proxyAgent } from './proxy.js'

export const httpFetch = (url: string, init?: any) =>
    fetch(url, {
        dispatcher: proxyAgent,
        ...init,
    })
