import type { CoordinatorState } from '@/coordinators/multi-timeframe-coordinator.js'
import type { BaseKlineManager } from '@/managers/base-kline-manager.js'
import type { StrategyContext } from './strategy-context.js'

export class StrategyContextBuilder {
    constructor(
        private readonly symbol: string,
        private readonly m5: BaseKlineManager,
        private readonly m15: BaseKlineManager,
        private readonly h1: BaseKlineManager,
        private readonly h4: BaseKlineManager
    ) {}

    /**
     * 从 CoordinatorState + managers 构造 StrategyContext
     * - 只在 coordinator.permission.allowed 时返回
     * - 保证 snapshot 齐全
     */
    build(state: CoordinatorState): StrategyContext | null {
        console.log('[ state.permission.allowed ] >', state.permission.allowed)
        if (!state.permission.allowed) return null

        const s5 = this.m5.getSnapshot?.()
        const s15 = this.m15.getSnapshot?.()
        const s1 = this.h1.getSnapshot?.()
        const s4 = this.h4.getSnapshot?.()
        console.log('[ k线快照状态 ] >', s5, s15, s1, s4)
        if (!s5 || !s15 || !s1 || !s4) return null

        return {
            symbol: this.symbol,
            permission: state.permission,

            h4: s4,
            h1: s1,
            m15: s15,
            m5: s5,

            computedAt: state.computedAt,
        }
    }
}
