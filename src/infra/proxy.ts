// proxy.ts
import { ProxyAgent } from 'undici'

export const proxyAgent = process.env.HTTP_PROXY
    ? new ProxyAgent(process.env.HTTP_PROXY)
    : undefined
