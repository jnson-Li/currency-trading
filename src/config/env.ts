// src/config/env.ts
import dotenv from 'dotenv'

const env = process.env.NODE_ENV || 'development'

dotenv.config({
    path: env === 'production' ? '.env.production' : '.env.local',
})

export const ENV = {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    HTTP_PROXY: process.env.HTTP_PROXY,
    PORT: Number(process.env.PORT ?? 3000),
    API_BASE_URL: process.env.API_BASE_URL ?? '',
}
