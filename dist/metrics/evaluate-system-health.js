export function evaluateSystemHealth(snapshot) {
    let score = 100;
    const warnings = [];
    const lifesavers = [];
    const ar = snapshot.totals.acceptanceRate;
    // acceptance rate
    if (ar > 0.6)
        score -= 30;
    else if (ar > 0.45)
        score -= 15;
    else if (ar < 0.05)
        score -= 25;
    else if (ar < 0.1)
        score -= 15;
    // dangerous errors
    if (snapshot.byReason['execution_error']?.count) {
        score -= 20;
        warnings.push('Execution errors present');
    }
    // confidence too low
    const conf = snapshot.byReason['confidence_too_low']?.count ?? 0;
    if (conf / snapshot.totals.count > 0.4) {
        score -= 15;
        warnings.push('Strategy confidence too low');
    }
    // lifesavers
    for (const r of ['cooldown', 'volatility_gate', 'atr_gate']) {
        const c = snapshot.byReason[r]?.count ?? 0;
        if (c > 0) {
            score += Math.min(10, c * 2);
            lifesavers.push({
                gate: r,
                rejected: c,
                note: 'protected system',
            });
        }
    }
    score = Math.max(0, Math.min(100, score));
    const shouldPause = score < 40 || (snapshot.totals.accepted === 0 && snapshot.totals.count >= 10);
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
