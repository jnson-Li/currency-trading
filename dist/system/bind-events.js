/**
 * 事件绑定（长期跑版）
 *
 * 设计原则：
 * - 只有 5m close 才能触发决策 / Strategy
 * - 高周期（15m / 1h / 4h）只更新状态，不触发
 * - 为避免跨周期同时收盘的顺序竞态：5m close 时延迟到 next tick 再取 snapshot
 * - 上游保险丝：5m closeTime 去重
 * - 可返回 unbind，支持优雅退出
 */
export function bindEvents(managers, coordinator, opts) {
    const { m5, m15, h1, h4 } = managers;
    const log = opts?.logger;
    const defer5mTrigger = opts?.defer5mTrigger ?? true;
    const log5m = opts?.log5m ?? false;
    let lastM5CloseTime = null;
    // 记录一下 off/unsubscribe（如果 onClosedKline 有返回函数，就能优雅解绑）
    const offs = [];
    /**
     * ✅ 5m close：系统唯一 Trigger
     */
    const offM5 = m5.onClosedKline((kline) => {
        const closeTime = kline?.closeTime;
        // 上游去重：防重连/补数据/重复事件
        if (typeof closeTime === 'number') {
            if (lastM5CloseTime === closeTime)
                return;
            lastM5CloseTime = closeTime;
        }
        if (log5m) {
            // 摘要日志：别打印整根 kline
            log?.info?.('[m5 closed]', { closeTime, close: kline?.close });
        }
        const fire = () => {
            coordinator.on5mClosed({
                '5m': m5.getSnapshot(),
                '15m': m15.getSnapshot(),
                '1h': h1.getSnapshot(),
                '4h': h4.getSnapshot(),
            });
        };
        // 关键：推迟到 next tick，尽量让同一批更新先把 15m/1h/4h 的 snapshot 更新好
        if (defer5mTrigger) {
            setTimeout(fire, 0);
        }
        else {
            fire();
        }
    });
    offs.push(typeof offM5 === 'function' ? offM5 : undefined);
    /**
     * ✅ 15m / 1h / 4h close：只更新多周期状态（不触发 Strategy）
     */
    const offM15 = m15.onClosedKline((kline) => {
        coordinator.onHigherIntervalClosed('15m', kline);
    });
    offs.push(typeof offM15 === 'function' ? offM15 : undefined);
    const offH1 = h1.onClosedKline((kline) => {
        coordinator.onHigherIntervalClosed('1h', kline);
    });
    offs.push(typeof offH1 === 'function' ? offH1 : undefined);
    const offH4 = h4.onClosedKline((kline) => {
        coordinator.onHigherIntervalClosed('4h', kline);
    });
    offs.push(typeof offH4 === 'function' ? offH4 : undefined);
    // 返回 unbind：长期跑（stop/restart）很重要
    return () => {
        for (const off of offs) {
            try {
                off?.();
            }
            catch (e) {
                log?.warn?.('[bindEvents] unbind error', e);
            }
        }
    };
}
