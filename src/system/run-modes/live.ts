// run-modes/live.ts
import type {
    ETH5mKlineManager,
    ETH15mKlineManager,
    ETH1hKlineManager,
    ETH4hKlineManager,
} from '@/managers/index.js'

type LiveManagers = {
    m5: ETH5mKlineManager
    m15: ETH15mKlineManager
    h1: ETH1hKlineManager
    h4: ETH4hKlineManager
}

export async function startLiveMode(managers: LiveManagers) {
    console.log('[live] starting...')

    await Promise.all([
        managers.m5.init(),
        managers.m15.init(),
        managers.h1.init(),
        managers.h4.init(),
    ])

    console.log('[live] started')

    let stopped = false

    return {
        /** 优雅关闭行情源 / 定时器 / ws */
        async stop() {
            if (stopped) return
            stopped = true

            console.warn('[live] stopping...')

            // 如果你的 manager 有 stop / close / destroy，用最通用的方式兜底
            const maybeStop = async (m: any) => {
                try {
                    if (typeof m.stop === 'function') await m.stop()
                    else if (typeof m.close === 'function') await m.close()
                    else if (typeof m.destroy === 'function') await m.destroy()
                } catch (e) {
                    console.error('[live] manager stop error:', e)
                }
            }

            await Promise.all([
                maybeStop(managers.m5),
                maybeStop(managers.m15),
                maybeStop(managers.h1),
                maybeStop(managers.h4),
            ])

            console.warn('[live] stopped')
        },
    }
}
