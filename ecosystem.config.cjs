module.exports = {
    apps: [
        {
            name: 'currency-trading', // PM2 里显示的名字
            script: 'dist/server.js', // 生产环境启动编译后的代码
            cwd: '/home/admin/currency-trading', // 项目绝对路径（很重要）
            node_args: '--enable-source-maps',

            // 运行模式
            exec_mode: 'fork', // 单进程（量化一般不需要 cluster）
            instances: 1,

            // 自动重启策略
            autorestart: true,
            watch: false, // 量化程序千万别 watch
            max_restarts: 10,
            restart_delay: 5000, // 防止疯狂重启

            // 内存保护（防泄漏）
            max_memory_restart: '300M',

            // 日志
            out_file: 'logs/out.log',
            error_file: 'logs/error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',

            // 环境变量
            env: {
                NODE_ENV: 'production',
                TZ: 'UTC',
            },

            // 优雅退出（给你下单/写日志留时间）
            kill_timeout: 5000,
        },
    ],
}
