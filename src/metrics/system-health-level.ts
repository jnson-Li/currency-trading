// src/metrics/system-health-level.ts
import type { SystemHealthReport } from '@/types/metrics.type.js'
import type { AlertLevel } from '@/alert/alert-level.js'

export function deriveAlertLevel(report: SystemHealthReport): AlertLevel {
    if (report.score >= 80) return 'warning'

    if (report.score < 80 && report.score >= 60) return 'danger'

    // < 60
    return 'fatal'
}
