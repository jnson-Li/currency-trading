import WebSocket from 'ws'
import { fetchBiAnKline } from '@/services/market.service.js'
import { Kline, BinanceRawKline } from '@/types/market.js'
import { wsProxyAgent } from '@/infra/ws-proxy.js'

export abstract class BaseKlineManager {
    /* ========= 子类必须实现 ========= */

    protected abstract readonly SYMBOL: string
    protected abstract readonly INTERVAL: string
    protected abstract readonly HTTP_LIMIT: number
    protected abstract readonly CACHE_LIMIT: number
    protected abstract readonly LOG_PREFIX: string

    /* ========= 内部状态 ========= */

    protected klines: Kline[] = []
    protected ws?: WebSocket
    protected syncing = false
    protected ready = false

    /* ========= WS 稳定性控制 ========= */

    private reconnecting = false
    private reconnectDelay = 1000 // 初始 1s
    private readonly MAX_RECONNECT_DELAY = 30_000
    private heartbeatTimer?: NodeJS.Timeout
    private lastMessageTs = 0

    /* ========= 生命周期 ========= */

    async init() {
        await this.syncByHTTP()
        this.ready = true
        this.startWS()
    }

    isReady() {
        return this.ready
    }

    getKlines(params: { symbol: string; interval: string; limit?: number | string }) {
        this.normalizeSymbol(params.symbol)
        this.normalizeInterval(params.interval)

        if (!this.ready) {
            throw new Error(`${this.LOG_PREFIX} not ready`)
        }

        const limit = params.limit ? Number(params.limit) : undefined
        return limit ? this.klines.slice(-limit) : [...this.klines]
    }

    /* ========= 参数规范化 ========= */

    protected normalizeSymbol(input: string) {
        const symbol = input.trim().toUpperCase()
        if (symbol !== this.SYMBOL) {
            throw new Error(`Unsupported symbol: ${symbol}`)
        }
    }

    protected normalizeInterval(input: string) {
        const interval = input.trim()
        if (interval !== this.INTERVAL) {
            throw new Error(`Unsupported interval: ${interval}`)
        }
    }

    /* ========= HTTP ========= */

    protected async syncByHTTP() {
        if (this.syncing) return
        this.syncing = true

        const rawList = await fetchBiAnKline({
            symbol: this.SYMBOL,
            interval: this.INTERVAL,
            limit: this.HTTP_LIMIT,
        })

        rawList.forEach((raw) => {
            const kline = this.fromHttpRaw(raw)
            this.upsertKline(kline)
        })

        this.trimCache()
        this.syncing = false
    }

    protected fromHttpRaw(raw: BinanceRawKline): Kline {
        return {
            openTime: raw[0],
            open: Number(raw[1]),
            high: Number(raw[2]),
            low: Number(raw[3]),
            close: Number(raw[4]),
            volume: Number(raw[5]),
            closeTime: raw[6],
        }
    }

    /* ========= WS 核心（稳定版） ========= */

    protected startWS() {
        if (this.reconnecting) return

        const stream = `${this.SYMBOL.toLowerCase()}@kline_${this.INTERVAL}`
        const url = `wss://stream.binance.com:9443/ws/${stream}`

        console.log(`[${this.LOG_PREFIX}] WS connecting...`)

        this.ws = new WebSocket(url, {
            agent: wsProxyAgent,
            handshakeTimeout: 10_000,
        })

        this.ws.on('open', () => {
            console.log(`[${this.LOG_PREFIX}] WS connected`)
            this.reconnectDelay = 1000
            this.startHeartbeat()
        })

        this.ws.on('message', (raw) => {
            this.lastMessageTs = Date.now()
            this.reconnectDelay = 1000 // 收到消息说明连接健康

            try {
                this.handleWSMessage(raw.toString())
            } catch (e) {
                console.error(`[${this.LOG_PREFIX}] WS parse error`, e)
            }
        })

        this.ws.on('close', () => {
            console.warn(`[${this.LOG_PREFIX}] WS closed`)
            this.stopHeartbeat()
            this.scheduleReconnect()
        })

        this.ws.on('error', (err) => {
            console.warn(`[${this.LOG_PREFIX}] WS error`, err)
            this.ws?.close()
        })
    }

    private scheduleReconnect() {
        if (this.reconnecting) return
        this.reconnecting = true

        setTimeout(async () => {
            console.warn(`[${this.LOG_PREFIX}] WS reconnecting after ${this.reconnectDelay}ms`)

            await this.syncByHTTP()

            this.reconnecting = false
            this.startWS()

            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.MAX_RECONNECT_DELAY)
        }, this.reconnectDelay)
    }

    /* ========= 心跳检测 ========= */

    private startHeartbeat() {
        this.stopHeartbeat()

        this.lastMessageTs = Date.now()

        this.heartbeatTimer = setInterval(() => {
            const now = Date.now()
            if (now - this.lastMessageTs > 60_000) {
                console.warn(`[${this.LOG_PREFIX}] WS heartbeat timeout`)
                this.ws?.terminate()
            }
        }, 30_000)
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = undefined
        }
    }

    /* ========= WS 数据处理 ========= */

    protected handleWSMessage(message: string) {
        const data = JSON.parse(message)
        const k = data?.k
        if (!k || k.x !== true) return

        const kline = this.fromWsRaw(k)
        this.upsertKline(kline)
        this.trimCache()
        this.onNewClosedKline(kline)
    }

    protected fromWsRaw(k: any): Kline {
        return {
            openTime: k.t,
            closeTime: k.T,
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v),
        }
    }

    /* ========= 缓存 ========= */

    protected upsertKline(k: Kline) {
        const idx = this.klines.findIndex((i) => i.openTime === k.openTime)

        if (idx >= 0) {
            this.klines[idx] = k
        } else {
            this.klines.push(k)
            this.klines.sort((a, b) => a.openTime - b.openTime)
        }
    }

    protected trimCache() {
        if (this.klines.length > this.CACHE_LIMIT) {
            this.klines = this.klines.slice(-this.CACHE_LIMIT)
        }
    }

    /* ========= 钩子 ========= */

    protected abstract onNewClosedKline(k: Kline): void
}
