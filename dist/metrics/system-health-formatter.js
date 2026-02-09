export function formatSystemHealth(report) {
    const lines = [];
    lines.push(`🧠 SYSTEM HEALTH REPORT`);
    lines.push(``);
    lines.push(`Score: ${report.score} / 100`);
    lines.push(`Status: ${report.status.toUpperCase()}`);
    lines.push(`Should pause: ${report.shouldPause ? 'YES' : 'NO'}`);
    lines.push(``);
    // ===== 执行摘要 =====
    lines.push(`📊 Execution Summary`);
    lines.push(`- total signals: ${report.summary.count}`);
    lines.push(`- accepted: ${report.summary.accepted}`);
    lines.push(`- rejected: ${report.summary.rejected}`);
    lines.push(`- acceptance rate: ${(report.summary.acceptanceRate * 100).toFixed(2)}%`);
    // ===== lifesavers =====
    if (report.lifesavers.length > 0) {
        lines.push(``);
        lines.push(`🛡️ Lifesaver Gates (saved you from damage):`);
        for (const l of report.lifesavers) {
            lines.push(`- ${l.gate}: rejected ${l.rejected} (${l.note})`);
        }
    }
    // ===== warnings =====
    if (report.warnings.length > 0) {
        lines.push(``);
        lines.push(`⚠️ Warnings:`);
        for (const w of report.warnings) {
            lines.push(`- ${w}`);
        }
    }
    return lines.join('\n');
}
