// src/metrics/register-ws-health.ts
import fs from 'node:fs'
import path from 'node:path'

import type { BaseKlineManager } from '@/managers/base-kline-manager.js'
import { startWsHealthReporter } from './ws-health-reporter.js'

interface RegisterWsHealthOptions {
    intervalMs: number
    outputDir: string
}

function ensureDir(dir: string) {
    // recursive: true = mkdir -p
    fs.mkdirSync(dir, { recursive: true })
}

export function registerWsHealthForManagers(
    managers: Record<string, BaseKlineManager>,
    opts: RegisterWsHealthOptions,
) {
    const outputDir = path.resolve(opts.outputDir)
    ensureDir(outputDir)

    const stops: Array<() => void> = []

    for (const [name, mgr] of Object.entries(managers)) {
        const file = path.join(outputDir, `ws-health-${name}.jsonl`)

        const stop = startWsHealthReporter(() => mgr.getWsHealthSnapshot(), {
            intervalMs: opts.intervalMs,
            file,
        })

        stops.push(stop)
    }

    return {
        stopAll() {
            for (const s of stops) s()
        },
    }
}
