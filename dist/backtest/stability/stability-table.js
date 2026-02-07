export function buildStabilityTable(rows) {
    const scores = rows.map((r) => r.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const worst = Math.min(...scores);
    const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    let verdict = 'unstable';
    if (avg >= 75 && worst >= 60)
        verdict = 'excellent';
    else if (avg >= 60 && worst >= 40)
        verdict = 'acceptable';
    return {
        averageScore: Math.round(avg),
        worstScore: worst,
        stdDev: Math.round(stdDev),
        verdict,
    };
}
