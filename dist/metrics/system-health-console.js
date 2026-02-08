export function consoleAlert(report) {
    if (report.status === 'healthy')
        return;
    const tag = report.status === 'danger' ? '🚨 DANGER' : '⚠️ WARNING';
    console.warn(tag, {
        score: report.score,
        shouldPause: report.shouldPause,
        acceptanceRate: report.summary.acceptanceRate,
        lifesavers: report.lifesavers.map((l) => l.gate),
        warnings: report.warnings,
    });
}
