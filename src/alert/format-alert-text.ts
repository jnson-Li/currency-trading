// src/alert/format-alert-text.ts
import type { AlertLevel } from './alert-level.js'
import { formatSystemHealth } from '@/metrics/system-health-formatter.js'
import type { SystemHealthReport } from '@/types/metrics.type.js'

export function formatAlertText(level: AlertLevel, env: string, report: SystemHealthReport) {
    const prefix =
        level === 'warning' ? '🟡 WARNING' : level === 'danger' ? '🟠 DANGER' : '🔴 FATAL'

    return `
${prefix} | ENV: ${env}

${formatSystemHealth(report)}
`
}
