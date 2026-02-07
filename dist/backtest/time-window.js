// backtest/time-window.ts
export function getLast6MonthsWindow(now = Date.now()) {
    const endTime = now;
    const start = new Date(now);
    start.setMonth(start.getMonth() - 6);
    return {
        startTime: start.getTime(),
        endTime,
    };
}
