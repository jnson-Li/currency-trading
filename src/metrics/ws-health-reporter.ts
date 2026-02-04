// src/metrics/ws-health-reporter.ts
import fs from 'fs'
import type { WsHealthSnapshot } from '@/types/coordinator.js'

export interface WsHealthReporterOptions {
    intervalMs: number
    file?: string
    logger?: Pick<Console, 'info' | 'warn'>
    resetAfterReport?: boolean
}

export function startWsHealthReporter(
    snapshotProvider: () => WsHealthSnapshot,
    opts: WsHealthReporterOptions,
) {
    const { intervalMs, file, logger = console } = opts

    const timer = setInterval(() => {
        try {
            const snap = snapshotProvider()

            logger.info('[ws-health]', {
                symbol: snap.symbol,
                interval: snap.interval,
                gauges: snap.gauges,
                counters: snap.counters,
            })

            if (file) {
                fs.appendFileSync(file, JSON.stringify(snap) + '\n')
            }
        } catch (e) {
            logger.warn('[ws-health] reporter error', e)
        }
    }, intervalMs)

    timer.unref?.()

    return () => clearInterval(timer)
}
