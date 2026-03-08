import WebSocket from 'ws';
import { fetchBiAnKline } from '../services/market.service.js';
import { wsProxyAgent } from '../infra/proxy.js';
import { intervalToMs } from '../utils/interval.js';
import { WsHealthCollector } from '../metrics/ws-health-collector.js';
const INTERVAL_LEVEL_MAP = {
    '5m': 'L1',
    '15m': 'L1',
    '1h': 'L2',
    '4h': 'L3',
};
export class BaseKlineManager {
    /* ========= 子类必须实现 ========= */
    SYMBOL;
    INTERVAL;
    /* ========= 内部状态 ========= */
    klines = [];
    lastKline;
    ws;
    syncing = false;
    ready = false;
    lastCloseTime;
    lastConfirmedCloseTime;
    /* ========= 分析状态（统一托管） ========= */
    trend = 'range';
    structure = 'range';
    /* ========= WS 稳定性控制 ========= */
    closedListeners = new Set();
    reconnecting = false;
    reconnectDelay = 1000; // 初始 1s
    MAX_RECONNECT_DELAY = 30_000;
    heartbeatTimer;
    lastMessageTs = 0;
    timeHealth = 'healthy';
    lastResyncTs = 0;
    reconnectTimer;
    resyncing = false;
    blockedByRollback = false;
    wsHealth;
    constructor(symbol, interval) {
        this.SYMBOL = symbol;
        this.INTERVAL = interval;
        this.wsHealth = new WsHealthCollector(symbol, interval);
    }
    getWsHealthSnapshot() {
        return this.wsHealth.snapshot();
    }
    /* ========= 生命周期 ========= */
    async init() {
        await this.syncByHTTP();
        this.ready = true;
        this.startWS();
    }
    isReady() {
        return this.ready;
    }
    getKlines(params) {
        this.normalizeSymbol(params.symbol);
        this.normalizeInterval(params.interval);
        if (!this.ready) {
            throw new Error(`${this.LOG_PREFIX} not ready`);
        }
        const limit = params.limit ? Number(params.limit) : undefined;
        return limit ? this.klines.slice(-limit) : [...this.klines];
    }
    /* ========= 参数规范化 ========= */
    normalizeSymbol(input) {
        const symbol = input.trim().toUpperCase();
        if (symbol !== this.SYMBOL) {
            throw new Error(`Unsupported symbol: ${symbol}`);
        }
    }
    normalizeInterval(input) {
        const interval = input.trim();
        if (interval !== this.INTERVAL) {
            throw new Error(`Unsupported interval: ${interval}`);
        }
    }
    /* ========= HTTP ========= */
    async syncByHTTP() {
        if (this.syncing)
            return;
        this.syncing = true;
        try {
            const rawList = await fetchBiAnKline({
                symbol: this.SYMBOL,
                interval: this.INTERVAL,
                limit: this.HTTP_LIMIT,
            });
            rawList.forEach((raw) => {
                const kline = this.fromHttpRaw(raw);
                this.upsertKline(kline);
            });
            this.trimCache();
            this.updateAnalysis();
        }
        finally {
            this.syncing = false;
        }
    }
    fromHttpRaw(raw) {
        return {
            openTime: raw[0],
            open: Number(raw[1]),
            high: Number(raw[2]),
            low: Number(raw[3]),
            close: Number(raw[4]),
            volume: Number(raw[5]),
            closeTime: raw[6],
        };
    }
    /* ========= WS 核心（稳定版） ========= */
    startWS() {
        // 如果已经有连接（CONNECTING/OPEN），不重复建
        const state = this.ws?.readyState;
        if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
            return;
        }
        const stream = `${this.SYMBOL.toLowerCase()}@kline_${this.INTERVAL}`;
        const url = `wss://stream.binance.com:9443/ws/${stream}`;
        console.log(`[${this.LOG_PREFIX}] WS connecting...`);
        this.ws = new WebSocket(url, {
            agent: wsProxyAgent,
            handshakeTimeout: 10_000,
        });
        this.ws.on('open', () => {
            console.log(`[${this.LOG_PREFIX}] WS connected`);
            this.wsHealth.inc('ws_connected');
            this.wsHealth.setAlive(true);
            this.reconnectDelay = 1000;
            this.startHeartbeat();
        });
        this.ws.on('message', (raw) => {
            this.lastMessageTs = Date.now();
            this.reconnectDelay = 1000; // 收到消息说明连接健康
            this.wsHealth.inc('ws_message');
            this.wsHealth.setLastMessage(Date.now());
            try {
                this.handleWSMessage(raw.toString());
            }
            catch (e) {
                console.error(`[${this.LOG_PREFIX}] WS parse error`, e);
            }
        });
        this.ws.on('close', () => {
            console.warn(`[${this.LOG_PREFIX}] WS closed`);
            this.wsHealth.inc('ws_disconnected');
            this.wsHealth.setAlive(false);
            this.stopHeartbeat();
            this.scheduleReconnect();
        });
        this.ws.on('error', (err) => {
            console.warn(`[${this.LOG_PREFIX}] WS error`, err);
            this.wsHealth.inc('ws_error');
            this.ws?.close();
        });
    }
    scheduleReconnect() {
        if (this.reconnecting)
            return;
        this.reconnecting = true;
        this.reconnectTimer = setTimeout(async () => {
            console.warn(`[${this.LOG_PREFIX}] WS reconnecting after ${this.reconnectDelay}ms`);
            await this.syncByHTTP();
            this.reconnecting = false;
            this.startWS();
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.MAX_RECONNECT_DELAY);
            this.reconnectTimer = undefined;
        }, this.reconnectDelay);
    }
    /* ========= 心跳检测 ========= */
    startHeartbeat() {
        this.stopHeartbeat();
        this.lastMessageTs = Date.now();
        const expectedStep = intervalToMs(this.INTERVAL);
        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();
            // WS 断流
            if (now - this.lastMessageTs > 60_000) {
                console.warn(`[${this.LOG_PREFIX}] WS heartbeat timeout`);
                this.wsHealth.inc('ws_heartbeat_timeout');
                this.ws?.terminate();
                return;
            }
            // 🟠 K 线 stale
            if (this.lastCloseTime && now - this.lastCloseTime > expectedStep * 2) {
                console.warn(`[${this.LOG_PREFIX}] kline stale detected`);
                this.wsHealth.inc('ws_stale_detected');
                this.wsHealth.setTimeHealth('broken');
                this.timeHealth = 'broken';
                this.tryResync('stale');
            }
        }, 30_000);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
    }
    /* ========= WS 数据处理 ========= */
    handleWSMessage(message) {
        const data = JSON.parse(message);
        const k = data?.k;
        // console.log('[ WSk线 ] >', data)
        if (!k || k.x !== true)
            return;
        const kline = this.fromWsRaw(k);
        this.upsertKline(kline);
        this.trimCache();
        this.onNewClosedKline(kline);
        this.lastConfirmedCloseTime = kline.closeTime;
        this.wsHealth.setLastCloseTime(kline.closeTime);
    }
    fromWsRaw(k) {
        return {
            openTime: k.t,
            closeTime: k.T,
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v),
        };
    }
    /* ========= 缓存 ========= */
    async forceResync() {
        console.warn(`[${this.LOG_PREFIX}] force resync start`);
        this.blockedByRollback = false;
        this.wsHealth.inc('ws_resync_triggered');
        // ✅ 取消 pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }
        this.reconnecting = false;
        this.reconnectDelay = 1000;
        // 1️⃣ 停 WS
        this.ws?.terminate();
        this.stopHeartbeat();
        // 2️⃣ 清空状态（非常关键）
        this.klines = [];
        this.lastKline = undefined;
        this.lastCloseTime = undefined;
        this.ready = false;
        this.timeHealth = 'healthy';
        // 3️⃣ 重新走 init 流程
        await this.syncByHTTP();
        this.ready = true;
        this.startWS();
        console.warn(`[${this.LOG_PREFIX}] force resync done`);
    }
    async tryResync(reason) {
        if (this.resyncing)
            return;
        const now = Date.now();
        if (now - this.lastResyncTs < 60_000) {
            console.warn(`[${this.LOG_PREFIX}] resync skipped (cooldown)`);
            return;
        }
        this.resyncing = true;
        try {
            console.warn(`[${this.LOG_PREFIX}] resync triggered`, `reason=${reason}`);
            this.lastResyncTs = now;
            await this.forceResync();
        }
        finally {
            this.resyncing = false;
        }
    }
    upsertKline(k) {
        const expectedStep = intervalToMs(this.INTERVAL);
        if (this.blockedByRollback) {
            // 丢弃所有数据，直到 resync 成功
            return;
        }
        if (this.lastCloseTime != null) {
            // ❌ 时间回退：直接标记 broken
            if (k.closeTime < this.lastCloseTime) {
                console.error(`[${this.LOG_PREFIX}] kline time rollback`, new Date(k.closeTime).toISOString());
                this.wsHealth.inc('ws_rollback_detected');
                this.timeHealth = 'broken';
                this.blockedByRollback = true;
                void this.tryResync('rollback');
                return;
            }
            const delta = k.closeTime - this.lastCloseTime;
            // 🟡 跳 K：警告，但不立刻 resync
            if (delta >= expectedStep * 2) {
                console.warn(`[${this.LOG_PREFIX}] kline gap detected`, `gap=${delta / expectedStep}`);
                this.wsHealth.inc('ws_gap_detected');
                this.timeHealth = 'warning';
                this.wsHealth.setTimeHealth(this.timeHealth);
            }
            else {
                this.timeHealth = 'healthy';
            }
        }
        // ===== 正常 upsert =====
        const idx = this.klines.findIndex((i) => i.openTime === k.openTime);
        if (idx >= 0) {
            this.klines[idx] = k;
        }
        else {
            this.klines.push(k);
            this.klines.sort((a, b) => a.openTime - b.openTime);
        }
        this.lastKline = k;
        this.lastCloseTime = k.closeTime;
    }
    trimCache() {
        if (this.klines.length > this.CACHE_LIMIT) {
            this.klines = this.klines.slice(-this.CACHE_LIMIT);
        }
    }
    getSnapshot() {
        if (!this.lastKline)
            return null;
        return {
            symbol: this.SYMBOL,
            interval: this.INTERVAL,
            level: INTERVAL_LEVEL_MAP[this.INTERVAL],
            lastKline: this.lastKline,
            lastConfirmedCloseTime: this.lastConfirmedCloseTime,
            ready: this.ready,
            cacheSize: this.klines.length,
            timeHealth: this.timeHealth,
            trend: this.trend,
            structure: this.structure,
            updatedAt: Date.now(),
            ...this.getExtraSnapshot(), //  5m / 15m 扩展
        };
    }
    /* ========= 提供给子类的辅助 ========= */
    getCloses() {
        return this.klines.map((k) => k.close);
    }
    getHighs() {
        return this.klines.map((k) => k.high);
    }
    getLows() {
        return this.klines.map((k) => k.low);
    }
    feedHistoricalKline(k) {
        // 和 WS 收盘逻辑完全一致
        this.upsertKline(k);
        this.trimCache();
        // ⚠️ 人工触发“收盘事件”
        this.onNewClosedKline(k);
    }
    /* ========= 生命周期钩子 ========= */
    /**
     * 默认什么都不做
     * 只有需要趋势 / 结构的周期才 override
     */
    updateAnalysis() {
        // no-op
    }
    afterAnalysis(k) {
        // no-op
    }
    /**
     * ⚠️ 唯一正确的分析触发点
     * 每一根“已收盘 K 线”都会触发
     */
    // 订阅k线关闭事件
    onClosedKline(cb) {
        this.closedListeners.add(cb);
        return () => this.closedListeners.delete(cb);
    }
    onNewClosedKline(k) {
        this.updateAnalysis();
        this.afterAnalysis(k);
        for (const cb of this.closedListeners) {
            try {
                cb(k);
            }
            catch (e) {
                console.error('[BaseKlineManager] closed listener error', e);
            }
        }
    }
}
