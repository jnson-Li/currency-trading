// backtest/backtest-coordinator.ts
import type { CoordinatorState } from '@/managers/multi-timeframe-coordinator.js'
import type { TradePermission } from '@/types/strategy.js'

export class BacktestCoordinator {
    constructor(private readonly symbol: string) {}

    makeState(computedAt: number): CoordinatorState {
        const permission: TradePermission = {
            allowed: true,
            reason: 'backtest',
        } as any

        // 注意：StrategyContextBuilder 只用 permission + computedAt
        // snapshots 字段为了满足类型（你也可以给 null）
        return {
            symbol: this.symbol,
            snapshots: { m5: null, h1: null, h4: null } as any,
            permission,
            computedAt,
        }
    }
}
