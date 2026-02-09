// src/config/env.ts
import dotenv from 'dotenv';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
// ✅ 只在非 production 加载 dotenv
if (NODE_ENV !== 'production') {
    dotenv.config({
        path: '.env.local',
    });
}
function requireEnv(name) {
    const v = process.env[name];
    if (!v) {
        throw new Error(`[env] missing ${name}`);
    }
    return v;
}
export const ENV = {
    NODE_ENV,
    PORT: Number(process.env.PORT ?? 3000),
    API_BASE_URL: process.env.API_BASE_URL ?? '',
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    // 🔐 敏感信息：必须存在
    TG_BOT_TOKEN: requireEnv('TG_BOT_TOKEN'),
    TG_CHAT_ID: requireEnv('TG_CHAT_ID'),
};
