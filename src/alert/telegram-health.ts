// src/alert/telegram-health.ts
import { sendTelegram } from './telegram.js'
import { ENV } from '@/config/env.js'
import { formatAlertText } from './format-alert-text.js'
import type { SystemHealthReport } from '@/types/metrics.type.js'
import type { AlertLevel } from '@/alert/alert-level.js'
import { deriveAlertLevel } from '@/metrics/system-health-level.js'
export async function telegramAlert(report: SystemHealthReport) {
    const level = deriveAlertLevel(report)
    // 本地环境：不打 Telegram
    if (ENV.NODE_ENV === 'development') return

    // production / staging 才打 TG
    if (level === 'warning') return
    const text = formatAlertText(level, ENV.NODE_ENV, report)

    await sendTelegram(ENV.TG_BOT_TOKEN, ENV.TG_CHAT_ID, text)
}
