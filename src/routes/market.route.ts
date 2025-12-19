// src/routes/market.route.ts
import { FastifyInstance } from 'fastify'
import { fetchNewKline } from '../services/market.service.js'
import { NewKlineParams } from '../types/market.js'
import { getMarketSchema } from '../schemas/user.market.js'

export default async function marketRoutes(app: FastifyInstance) {
    app.post<{
        Body: NewKlineParams
    }>('/kline', {
        schema: getMarketSchema,
        handler: async (request) => {
            const data = await fetchNewKline(request.body)
            return { msg: 'success', data }
        },
    })
}
