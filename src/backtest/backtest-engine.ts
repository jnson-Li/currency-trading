// backtest/backtest-engine.ts
import { TradeResult, BacktestConfig } from '@/types/backtest.js'
import { TradeSignal } from '@/types/strategy.js'

export class BacktestEngine {
    private balance: number
    private openTrade: TradeResult | null = null
    private results: TradeResult[] = []

    constructor(private readonly config: BacktestConfig) {
        this.balance = config.initialBalance
    }

    onSignal(signal: TradeSignal) {
        if (this.openTrade) return // 已有持仓，不再开仓

        const entryPrice = this.applySlippage(signal.price, signal.side)

        this.openTrade = {
            signal,
            side: signal.side,
            entryPrice,
            entryTime: signal.createdAt,

            exitPrice: 0,
            exitTime: 0,
            outcome: 'breakeven',

            pnl: 0,
            pnlPct: 0,

            maxFavorableExcursion: 0,
            maxAdverseExcursion: 0,
        }
    }

    onNew5mCandle(k: { high: number; low: number; close: number; closeTime: number }) {
        if (!this.openTrade) return

        this.updateMAEMFE(k)
        this.checkExit(k)
    }

    private checkExit(k: any) {
        const t = this.openTrade!
        const { stopLossPct, takeProfitPct } = this.config

        const sl =
            t.side === 'long' ? t.entryPrice * (1 - stopLossPct) : t.entryPrice * (1 + stopLossPct)

        const tp =
            t.side === 'long'
                ? t.entryPrice * (1 + takeProfitPct)
                : t.entryPrice * (1 - takeProfitPct)

        const hitSL = t.side === 'long' ? k.low <= sl : k.high >= sl

        const hitTP = t.side === 'long' ? k.high >= tp : k.low <= tp

        if (hitSL || hitTP) {
            const exitPrice = hitTP ? tp : sl
            this.closeTrade(exitPrice, k.closeTime)
        }
    }

    private closeTrade(price: number, time: number) {
        const t = this.openTrade!
        t.exitPrice = price
        t.exitTime = time

        const rawPnL = t.side === 'long' ? price - t.entryPrice : t.entryPrice - price

        const fee = price * this.config.feeRate
        t.pnl = rawPnL - fee
        t.pnlPct = t.pnl / t.entryPrice

        t.outcome = t.pnl > 0 ? 'win' : 'loss'

        this.balance += t.pnl
        this.results.push(t)
        this.openTrade = null
    }

    private updateMAEMFE(k: any) {
        const t = this.openTrade!
        const favorable = t.side === 'long' ? k.high - t.entryPrice : t.entryPrice - k.low

        const adverse = t.side === 'long' ? t.entryPrice - k.low : k.high - t.entryPrice

        t.maxFavorableExcursion = Math.max(t.maxFavorableExcursion, favorable)

        t.maxAdverseExcursion = Math.max(t.maxAdverseExcursion, adverse)
    }

    private applySlippage(price: number, side: 'long' | 'short') {
        const slip = price * this.config.slippage
        return side === 'long' ? price + slip : price - slip
    }

    getResults() {
        return this.results
    }
}
