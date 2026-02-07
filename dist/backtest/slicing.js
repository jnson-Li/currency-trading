// backtest/slicing.ts
export function splitByMonths(startTime, endTime, months = 1) {
    const slices = [];
    let cur = new Date(startTime);
    while (cur.getTime() < endTime) {
        const start = cur.getTime();
        const next = new Date(cur);
        next.setMonth(next.getMonth() + months);
        const end = Math.min(next.getTime(), endTime);
        slices.push({ start, end });
        cur = next;
    }
    return slices;
}
