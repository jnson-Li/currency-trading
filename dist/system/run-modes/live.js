function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
export async function startLiveMode(managers) {
    console.log('[live] starting (staggered init)...');
    const steps = [
        ['5m', managers.m5], // ⭐ 最关键，先起
        ['15m', managers.m15],
        ['1h', managers.h1],
        ['4h', managers.h4], // 最不敏感，最后
    ];
    for (const [name, mgr] of steps) {
        try {
            console.log(`[live] init ${name}...`);
            await mgr.init();
            console.log(`[live] ${name} ready`);
        }
        catch (e) {
            console.error(`[live] ${name} init failed`, e);
            // ❗不中断启动，让系统整体还能跑
        }
        // ⭐ 错峰间隔（可调）
        await sleep(800);
    }
    console.log('[live] started');
    let stopped = false;
    return {
        async stop() {
            if (stopped)
                return;
            stopped = true;
            console.warn('[live] stopping...');
            const maybeStop = async (m) => {
                try {
                    if (typeof m.stop === 'function')
                        await m.stop();
                    else if (typeof m.close === 'function')
                        await m.close();
                    else if (typeof m.destroy === 'function')
                        await m.destroy();
                }
                catch (e) {
                    console.error('[live] manager stop error:', e);
                }
            };
            // 停止顺序反过来（可选，但更优雅）
            await Promise.all([
                maybeStop(managers.h4),
                maybeStop(managers.h1),
                maybeStop(managers.m15),
                maybeStop(managers.m5),
            ]);
            console.warn('[live] stopped');
        },
    };
}
