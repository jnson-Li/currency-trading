export function deriveAlertLevel(report) {
    if (report.score >= 80)
        return 'warning';
    if (report.score < 80 && report.score >= 60)
        return 'danger';
    // < 60
    return 'fatal';
}
