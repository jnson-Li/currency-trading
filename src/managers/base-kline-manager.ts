import WebSocket from 'ws'
import { fetchBiAnKline } from '@/services/market.service.js'
import {
    Kline,
    BinanceRawKline,
    KlineSnapshot,
    IntervalLevel,
    Structure,
    Trend,
    Interval,
} from '@/types/market.js'
import { wsProxyAgent } from '@/infra/proxy.js'
import { intervalToMs } from '@/utils/interval.js'
import { WsHealthCollector } from '@/metrics/ws-health-collector.js'
import type { WsHealthSnapshot } from '@/types/coordinator.js'
const INTERVAL_LEVEL_MAP: Record<string, IntervalLevel> = {
    '5m': 'L1',
    '1h': 'L2',
    '4h': 'L3',
}

export abstract class BaseKlineManager {
    /* ========= 子类必须实现 ========= */

    protected readonly SYMBOL: string
    protected readonly INTERVAL: Interval | '1m'
    protected abstract readonly HTTP_LIMIT: number
    protected abstract readonly CACHE_LIMIT: number
    protected abstract readonly LOG_PREFIX: string

    /* ========= 内部状态 ========= */

    protected klines: Kline[] = []
    protected lastKline?: Kline
    protected ws?: WebSocket
    protected syncing = false
    protected ready = false
    protected lastCloseTime?: number
    protected lastConfirmedCloseTime?: number

    /* ========= 分析状态（统一托管） ========= */
    protected trend: Trend = 'range'
    protected structure: Structure = 'range'

    /* ========= WS 稳定性控制 ========= */
    private closedListeners = new Set<(kline: Kline) => void>()

    private reconnecting = false
    private reconnectDelay = 1000 // 初始 1s
    private readonly MAX_RECONNECT_DELAY = 30_000
    private heartbeatTimer?: NodeJS.Timeout
    private lastMessageTs = 0
    protected timeHealth: 'healthy' | 'warning' | 'broken' = 'healthy'
    protected lastResyncTs = 0
    private reconnectTimer?: NodeJS.Timeout
    private resyncing = false
    private blockedByRollback = false

    protected wsHealth!: WsHealthCollector

    constructor(symbol: string, interval: Interval) {
        this.SYMBOL = symbol
        this.INTERVAL = interval
        this.wsHealth = new WsHealthCollector(symbol, interval)
    }

    public getWsHealthSnapshot(): WsHealthSnapshot {
        return this.wsHealth.snapshot()
    }
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
        try {
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
            this.updateAnalysis()
        } finally {
            this.syncing = false
        }
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
        // 如果已经有连接（CONNECTING/OPEN），不重复建
        const state = this.ws?.readyState
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
            return
        }

        const stream = `${this.SYMBOL.toLowerCase()}@kline_${this.INTERVAL}`
        const url = `wss://stream.binance.com:9443/ws/${stream}`

        console.log(`[${this.LOG_PREFIX}] WS connecting...`)

        this.ws = new WebSocket(url, {
            agent: wsProxyAgent,
            handshakeTimeout: 10_000,
        })

        this.ws.on('open', () => {
            console.log(`[${this.LOG_PREFIX}] WS connected`)
            this.wsHealth.inc('ws_connected')
            this.wsHealth.setAlive(true)
            this.reconnectDelay = 1000
            this.startHeartbeat()
        })

        this.ws.on('message', (raw) => {
            this.lastMessageTs = Date.now()
            this.reconnectDelay = 1000 // 收到消息说明连接健康
            this.wsHealth.inc('ws_message')
            this.wsHealth.setLastMessage(Date.now())
            try {
                this.handleWSMessage(raw.toString())
            } catch (e) {
                console.error(`[${this.LOG_PREFIX}] WS parse error`, e)
            }
        })

        this.ws.on('close', () => {
            console.warn(`[${this.LOG_PREFIX}] WS closed`)
            this.wsHealth.inc('ws_disconnected')
            this.wsHealth.setAlive(false)
            this.stopHeartbeat()
            this.scheduleReconnect()
        })

        this.ws.on('error', (err) => {
            console.warn(`[${this.LOG_PREFIX}] WS error`, err)
            this.wsHealth.inc('ws_error')
            this.ws?.close()
        })
    }

    private scheduleReconnect() {
        if (this.reconnecting) return
        this.reconnecting = true

        this.reconnectTimer = setTimeout(async () => {
            console.warn(`[${this.LOG_PREFIX}] WS reconnecting after ${this.reconnectDelay}ms`)

            await this.syncByHTTP()

            this.reconnecting = false
            this.startWS()

            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.MAX_RECONNECT_DELAY)
            this.reconnectTimer = undefined
        }, this.reconnectDelay)
    }

    /* ========= 心跳检测 ========= */

    private startHeartbeat() {
        this.stopHeartbeat()
        this.lastMessageTs = Date.now()

        const expectedStep = intervalToMs(this.INTERVAL)

        this.heartbeatTimer = setInterval(() => {
            const now = Date.now()

            // WS 断流
            if (now - this.lastMessageTs > 60_000) {
                console.warn(`[${this.LOG_PREFIX}] WS heartbeat timeout`)
                this.wsHealth.inc('ws_heartbeat_timeout')
                this.ws?.terminate()
                return
            }

            // 🟠 K 线 stale
            if (this.lastCloseTime && now - this.lastCloseTime > expectedStep * 2) {
                console.warn(`[${this.LOG_PREFIX}] kline stale detected`)
                this.wsHealth.inc('ws_stale_detected')
                this.wsHealth.setTimeHealth('broken')

                this.timeHealth = 'broken'
                this.tryResync('stale')
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
        // console.log('[ WSk线 ] >', data)

        if (!k || k.x !== true) return

        const kline = this.fromWsRaw(k)
        this.upsertKline(kline)
        this.trimCache()
        this.onNewClosedKline(kline)
        this.lastConfirmedCloseTime = kline.closeTime
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

    protected async forceResync() {
        console.warn(`[${this.LOG_PREFIX}] force resync start`)
        this.blockedByRollback = false
        this.wsHealth.inc('ws_resync_triggered')
        // ✅ 取消 pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = undefined
        }
        this.reconnecting = false
        this.reconnectDelay = 1000

        // 1️⃣ 停 WS
        this.ws?.terminate()
        this.stopHeartbeat()

        // 2️⃣ 清空状态（非常关键）
        this.klines = []
        this.lastKline = undefined
        this.lastCloseTime = undefined
        this.ready = false
        this.timeHealth = 'healthy'

        // 3️⃣ 重新走 init 流程
        await this.syncByHTTP()
        this.ready = true
        this.startWS()

        console.warn(`[${this.LOG_PREFIX}] force resync done`)
    }

    protected async tryResync(reason: 'rollback' | 'stale' | 'manual') {
        if (this.resyncing) return

        const now = Date.now()
        if (now - this.lastResyncTs < 60_000) {
            console.warn(`[${this.LOG_PREFIX}] resync skipped (cooldown)`)
            return
        }

        this.resyncing = true
        try {
            console.warn(`[${this.LOG_PREFIX}] resync triggered`, `reason=${reason}`)
            this.lastResyncTs = now
            await this.forceResync()
        } finally {
            this.resyncing = false
        }
    }

    protected upsertKline(k: Kline) {
        const expectedStep = intervalToMs(this.INTERVAL)
        if (this.blockedByRollback) {
            // 丢弃所有数据，直到 resync 成功
            return
        }

        if (this.lastCloseTime != null) {
            // ❌ 时间回退：直接标记 broken
            if (k.closeTime < this.lastCloseTime) {
                console.error(
                    `[${this.LOG_PREFIX}] kline time rollback`,
                    new Date(k.closeTime).toISOString(),
                )
                this.wsHealth.inc('ws_rollback_detected')
                this.timeHealth = 'broken'
                this.blockedByRollback = true
                void this.tryResync('rollback')

                return
            }

            const delta = k.closeTime - this.lastCloseTime

            // 🟡 跳 K：警告，但不立刻 resync
            if (delta >= expectedStep * 2) {
                console.warn(
                    `[${this.LOG_PREFIX}] kline gap detected`,
                    `gap=${delta / expectedStep}`,
                )
                this.wsHealth.inc('ws_gap_detected')
                this.timeHealth = 'warning'
                this.wsHealth.setTimeHealth(this.timeHealth)
            } else {
                this.timeHealth = 'healthy'
            }
        }

        // ===== 正常 upsert =====

        const idx = this.klines.findIndex((i) => i.openTime === k.openTime)

        if (idx >= 0) {
            this.klines[idx] = k
        } else {
            this.klines.push(k)
            this.klines.sort((a, b) => a.openTime - b.openTime)
        }

        this.lastKline = k
        this.lastCloseTime = k.closeTime
    }

    protected trimCache() {
        if (this.klines.length > this.CACHE_LIMIT) {
            this.klines = this.klines.slice(-this.CACHE_LIMIT)
        }
    }

    protected getExtraSnapshot(): Record<string, any> | null {
        return {}
    }

    public getSnapshot(): KlineSnapshot {
        if (!this.lastKline) return null

        return {
            symbol: this.SYMBOL,
            interval: this.INTERVAL as any,
            level: INTERVAL_LEVEL_MAP[this.INTERVAL],

            lastKline: this.lastKline,
            lastConfirmedCloseTime: this.lastConfirmedCloseTime,

            ready: this.ready,
            cacheSize: this.klines.length,
            timeHealth: this.timeHealth,

            trend: this.trend,
            structure: this.structure,

            ...this.getExtraSnapshot(), //  5m / 15m 扩展

            updatedAt: Date.now(),
        }
    }

    /* ========= 提供给子类的辅助 ========= */

    protected getCloses(): number[] {
        return this.klines.map((k) => k.close)
    }

    protected getHighs(): number[] {
        return this.klines.map((k) => k.high)
    }

    protected getLows(): number[] {
        return this.klines.map((k) => k.low)
    }

    public feedHistoricalKline(k: Kline) {
        // 和 WS 收盘逻辑完全一致
        this.upsertKline(k)
        this.trimCache()

        // ⚠️ 人工触发“收盘事件”
        this.onNewClosedKline(k)
    }

    /* ========= 生命周期钩子 ========= */
    /**
     * 默认什么都不做
     * 只有需要趋势 / 结构的周期才 override
     */
    protected updateAnalysis(): void {
        // no-op
    }

    protected afterAnalysis(k: Kline) {
        // no-op
    }
    /**
     * ⚠️ 唯一正确的分析触发点
     * 每一根“已收盘 K 线”都会触发
     */
    // 订阅k线关闭事件
    public onClosedKline(cb: (kline: Kline) => void) {
        this.closedListeners.add(cb)
        return () => this.closedListeners.delete(cb)
    }
    protected onNewClosedKline(k: Kline) {
        this.updateAnalysis()
        this.afterAnalysis(k)
        for (const cb of this.closedListeners) {
            try {
                cb(k)
            } catch (e) {
                console.error('[BaseKlineManager] closed listener error', e)
            }
        }
    }
}
