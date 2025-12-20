// ws-proxy.ts
import { HttpsProxyAgent } from 'https-proxy-agent'

export const wsProxyAgent = process.env.HTTPS_PROXY
    ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
    : undefined
