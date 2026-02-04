// src/metrics/register-ws-health.ts
import type { BaseKlineManager } from '@/managers/base-kline-manager.js'
import { startWsHealthReporter } from './ws-health-reporter.js'

interface RegisterWsHealthOptions {
    intervalMs: number
    outputDir: string
}

export function registerWsHealthForManagers(
    managers: Record<string, BaseKlineManager>,
    opts: RegisterWsHealthOptions,
) {
    const stops: Array<() => void> = []

    for (const [name, mgr] of Object.entries(managers)) {
        const stop = startWsHealthReporter(() => mgr.getWsHealthSnapshot(), {
            intervalMs: opts.intervalMs,
            file: `${opts.outputDir}/ws-health-${name}.jsonl`,
        })

        stops.push(stop)
    }

    return {
        stopAll() {
            for (const s of stops) s()
        },
    }
}
