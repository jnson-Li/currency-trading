// backtest/stability/stability-table.ts
import { scoreSlice } from './score.js'

export interface StabilityRow {
    slice: string
    score: number
}

export interface StabilitySummary {
    averageScore: number
    worstScore: number
    stdDev: number
    verdict: 'excellent' | 'acceptable' | 'unstable'
}

export function buildStabilityTable(rows: StabilityRow[]): StabilitySummary {
    const scores = rows.map((r) => r.score)

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const worst = Math.min(...scores)

    const variance = scores.reduce((s, v) => s + (v - avg) ** 2, 0) / scores.length
    const stdDev = Math.sqrt(variance)

    let verdict: StabilitySummary['verdict'] = 'unstable'
    if (avg >= 75 && worst >= 60) verdict = 'excellent'
    else if (avg >= 60 && worst >= 40) verdict = 'acceptable'

    return {
        averageScore: Math.round(avg),
        worstScore: worst,
        stdDev: Math.round(stdDev),
        verdict,
    }
}
