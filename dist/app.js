import Fastify from 'fastify';
import routes from './routes/index.js';
export async function buildApp() {
    const app = Fastify({
        logger: true,
    });
    // 注册路由
    app.register(routes);
    return app;
}
