// execution/execution-metrics.types.ts
import { ExecRejectReason } from '@/execution/execution-reject-reasons.js'

export interface ExecutionEvent {
    ts: number

    // 核心结果
    accepted: boolean
    reason: ExecRejectReason

    // 标识
    signalId: string
    symbol: string
    side: 'long' | 'short'

    // 执行来源
    mode: 'paper' | 'live'

    // 可选补充
    confidence?: number
    price?: number
    latencyMs?: number

    // 上下文（只保留你关心的摘要）
    meta?: {
        closeTime?: number
        permissionAllowed?: boolean
    }
}
