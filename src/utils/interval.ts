// utils/interval.ts
export function intervalToMs(interval: string): number {
    const map: Record<string, number> = {
        '1m': 60_000,
        '5m': 5 * 60_000,
        '15m': 15 * 60_000,
        '1h': 60 * 60_000,
        '4h': 4 * 60 * 60_000,
        '1d': 24 * 60 * 60_000,
    }

    const ms = map[interval]
    if (!ms) {
        throw new Error(`Unsupported interval: ${interval}`)
    }
    return ms
}
