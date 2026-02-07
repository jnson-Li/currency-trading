// proxy.ts

import { ProxyAgent } from 'undici'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { ENV } from '@/config/env.js'
const proxyUrl = ENV.HTTPS_PROXY || ENV.HTTP_PROXY

/**
 * HTTP（undici fetch）专用
 */
export const httpProxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

/**
 * WS（ws 包）专用
 */
export const wsProxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined

/**
 * 给日志 / metrics 用
 */
export const proxyEnabled = Boolean(proxyUrl)
