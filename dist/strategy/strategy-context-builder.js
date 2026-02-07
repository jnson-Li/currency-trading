function pickPermission(state) {
    // 兼容：
    // - old: state.permission
    // - new: state.decision.permission
    const p = state?.permission ?? state?.decision?.permission;
    if (!p)
        return { allowed: true };
    return {
        allowed: !!p.allowed,
        reason: p.reason,
        warnings: p.warnings,
    };
}
function pickSnapshots(state) {
    // 兼容：
    // - old: state.snapshots
    // - new: state.decision.snapshots
    const s = state?.snapshots ?? state?.decision?.snapshots;
    return s ?? null;
}
function pickTrigger(state) {
    // 兼容：
    // - new: state.trigger
    // - old: 没有 trigger（回测/旧版），那就从 state.computedAt / m5 closeTime 兜底
    const t = state?.trigger;
    if (t?.interval && t?.closeTime) {
        return {
            interval: t.interval,
            closeTime: t.closeTime,
            kline: t.kline,
        };
    }
    return null;
}
function requireSnapshot(snapshots, itv) {
    return snapshots?.[itv] ?? null;
}
export class StrategyContextBuilder {
    symbol;
    constructor(symbol) {
        this.symbol = symbol;
    }
    /**
     * build：把 CoordinatorState 变成 StrategyContext
     * - 支持 old/new 两种 state 结构
     * - 如果缺数据，返回 null，并给出明确原因（方便你排查 ctx 为 null）
     */
    build(state) {
        if (!state)
            return null;
        const permission = pickPermission(state);
        // ✅ 如果你希望 Strategy 永远只在 allowed 时触发，保留这行：
        if (permission.allowed === false)
            return null;
        const snapshots = pickSnapshots(state);
        if (!snapshots) {
            // 你之前一直 [skip] ctx is null，大概率是这里为 null
            // 表示 coordinator 没产出 snapshots（要么没 feed 到各周期，要么 state 结构对不上）
            return null;
        }
        // 触发信息（优先用 trigger；没有就兜底）
        let trigger = pickTrigger(state);
        if (!trigger) {
            // 兜底：默认认为是 5m close 触发（你现在的最终策略）
            const m5 = requireSnapshot(snapshots, '5m');
            const closeTime = m5?.closeTime ?? state?.createdAt ?? Date.now();
            trigger = {
                interval: '5m',
                closeTime,
            };
        }
        // ✅ 关键：确保你依赖的周期快照存在
        const m5 = requireSnapshot(snapshots, '5m');
        const m15 = requireSnapshot(snapshots, '15m');
        const h1 = requireSnapshot(snapshots, '1h');
        const h4 = requireSnapshot(snapshots, '4h');
        // 你的策略如果必须用到这些周期，就严格要求；否则你可以放宽
        if (!m5 || !m15 || !h1 || !h4) {
            return null;
        }
        return {
            symbol: this.symbol,
            permission,
            trigger,
            m5,
            m15,
            h1,
            h4,
            createdAt: Date.now(),
            meta: {
                computedAt: state?.createdAt,
            },
        };
    }
}
