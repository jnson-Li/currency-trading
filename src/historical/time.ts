export function monthKey(ts: number) {
    const d = new Date(ts)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthRange(ts: number) {
    const d = new Date(ts)
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
    const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1
    return { start, end }
}

export function iterateMonths(start: number, end: number) {
    const months: number[] = []
    let cursor = new Date(start)

    cursor.setUTCDate(1)
    cursor.setUTCHours(0, 0, 0, 0)

    while (cursor.getTime() <= end) {
        months.push(cursor.getTime())
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }

    return months
}
