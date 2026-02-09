export interface SystemHealthReport {
    score: number // 0 ~ 100
    status: 'healthy' | 'warning' | 'danger'
    shouldPause: boolean

    summary: {
        acceptanceRate: number
        count: number
        accepted: number
        rejected: number
    }

    lifesavers: Array<{
        gate: string
        rejected: number
        note: string
    }>

    warnings: string[]
}
