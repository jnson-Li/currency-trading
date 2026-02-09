// src/metrics/system-health-console.ts
import type { SystemHealthReport } from '@/types/metrics.type.js'

export function consoleAlert(report: SystemHealthReport) {
    if (report.status === 'healthy') return

    const tag = report.status === 'danger' ? '🚨 DANGER' : '⚠️ WARNING'

    console.warn(tag, {
        score: report.score,
        shouldPause: report.shouldPause,
        acceptanceRate: report.summary.acceptanceRate,
        lifesavers: report.lifesavers.map((l) => l.gate),
        warnings: report.warnings,
    })
}
