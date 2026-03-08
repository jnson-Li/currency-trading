import { EXEC_REASON } from '../execution/execution-reject-reasons.js';
export function evaluateSystemHealth(snapshot) {
    let score = 100;
    const warnings = [];
    const lifesavers = [];
    const total = snapshot.totals.count || 0;
    const accepted = snapshot.totals.accepted || 0;
    const ar = snapshot.totals.acceptanceRate || 0;
    // 1) 交易频率/过度交易：accepted 太多也未必好（你可按你策略风格调整）
    // 这里保留你原意：acceptanceRate 过高 => 可能过度交易
    if (ar > 0.6) {
        score -= 20;
        warnings.push('Acceptance rate too high (may be over-trading)');
    }
    else if (ar > 0.45) {
        score -= 10;
    }
    // 太低：可能完全不出手 / 数据不对 / gate 过严（但 gate 不在这里统计）
    if (ar < 0.05 && total >= 10) {
        score -= 25;
        warnings.push('Acceptance rate extremely low');
    }
    else if (ar < 0.1 && total >= 10) {
        score -= 15;
    }
    // 2) 执行错误（真正危险）
    const execErr = snapshot.byReason[EXEC_REASON.EXECUTION_ERROR]?.count ?? 0;
    if (execErr > 0) {
        score -= Math.min(30, execErr * 10);
        warnings.push(`Execution errors: ${execErr}`);
    }
    // 3) 真下单失败（如果你接交易所后会更重要）
    const exchangeReject = snapshot.byReason[EXEC_REASON.EXCHANGE_REJECT]?.count ?? 0;
    if (exchangeReject > 0) {
        score -= Math.min(20, exchangeReject * 5);
        warnings.push(`Exchange rejects: ${exchangeReject}`);
    }
    const timeout = snapshot.byReason[EXEC_REASON.EXEC_TIMEOUT]?.count ?? 0;
    if (timeout > 0) {
        score -= Math.min(20, timeout * 5);
        warnings.push(`Execution timeouts: ${timeout}`);
    }
    // 4) lifesavers（执行层“救命”的风控拒绝）
    const saverReasons = [
        { key: EXEC_REASON.ORDER_TOO_FREQUENT, note: 'blocked over-trading' },
        { key: EXEC_REASON.POSITION_ALREADY_OPEN, note: 'blocked duplicate exposure' },
        { key: EXEC_REASON.DAILY_LOSS_LIMIT, note: 'daily loss limit protected' },
        { key: EXEC_REASON.CONSECUTIVE_LOSS_LIMIT, note: 'consecutive loss breaker protected' },
        { key: EXEC_REASON.WARM_UP_PERIOD, note: 'warm-up protected' },
    ];
    for (const s of saverReasons) {
        const c = snapshot.byReason[s.key]?.count ?? 0;
        if (c > 0) {
            lifesavers.push({ gate: s.key, rejected: c, note: s.note });
            // “救命”加分可选：加一点点即可，别把危险盖掉
            score += Math.min(8, c);
        }
    }
    score = Math.max(0, Math.min(100, score));
    const shouldPause = score < 40 || (accepted === 0 && total >= 10) || execErr > 0;
    const status = score < 40 ? 'danger' : score < 70 ? 'warning' : 'healthy';
    return {
        score,
        status,
        shouldPause,
        summary: snapshot.totals,
        lifesavers,
        warnings,
    };
}
