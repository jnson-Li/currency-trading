// backtest/slicing.ts
export function splitByMonths(startTime: number, endTime: number, months = 1) {
    const slices: { start: number; end: number }[] = []
    let cur = new Date(startTime)

    while (cur.getTime() < endTime) {
        const start = cur.getTime()
        const next = new Date(cur)
        next.setMonth(next.getMonth() + months)
        const end = Math.min(next.getTime(), endTime)

        slices.push({ start, end })
        cur = next
    }

    return slices
}
