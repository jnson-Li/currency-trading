export const ENV = {
    API_BASE_URL: process.env.API_BASE_URL ?? '',
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: Number(process.env.PORT ?? 3000),
}
