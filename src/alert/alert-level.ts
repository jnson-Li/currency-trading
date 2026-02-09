// src/alert/alert-level.ts
export type AlertLevel = 'warning' | 'danger' | 'fatal'

export const ALERT_WEIGHT: Record<AlertLevel, number> = {
    warning: 1,
    danger: 2,
    fatal: 3,
}
