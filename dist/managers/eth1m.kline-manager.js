import { BaseKlineManager } from './base-kline-manager.js';
/**
 * ETH 1m K线管理器
 *
 * ⚠️ 定位：
 * - 作为“高频触发层”
 * - 不用于方向判断
 * - 用于更快捕捉 5m 级别信号
 */
export class ETH1mKlineManager extends BaseKlineManager {
    SYMBOL = 'ETHUSDT';
    INTERVAL = '1m';
    HTTP_LIMIT = 100;
    CACHE_LIMIT = 300;
    LOG_PREFIX = 'ETH 1m';
    /**
     * 1m 的历史回溯不宜太多
     * 防止内存压力 + 噪音过大
     */
    maxHistory = 200; // 约 8 小时
    /**
     * 技术指标刷新策略
     * 1m 不建议计算重指标
     */
    afterAnalysis() {
        // ❌ 不算 EMA200 / 结构位
        // ✅ 只保留必要的：
        // - 最近波动
        // - 是否快速突破
    }
}
