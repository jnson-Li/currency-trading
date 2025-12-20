// src/routes/market.route.ts
import { FastifyInstance } from 'fastify'
import { fetchNewKline, fetchBiAnKline } from '../services/market.service.js'
import { NewKlineParams, BiAnKlineParams } from '../types/market.js'
import { getMarketSchema, getBiAnKlineSchema } from '../schemas/user.market.js'

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
    app.get<{
        Querystring: BiAnKlineParams
    }>('/kline', {
        schema: getBiAnKlineSchema,
        handler: async (request) => {
            console.log('[ request.query ] >', request.query)
            const data = await fetchBiAnKline(request.query)
            return { msg: 'success', data }
        },
    })
}
