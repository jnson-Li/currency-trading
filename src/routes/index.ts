import { FastifyInstance } from 'fastify'
import userRoutes from './user.route.js'
import marketRoutes from './market.route.js'

export default async function routes(app: FastifyInstance) {
    app.register(userRoutes, { prefix: '/api/v1' })
    app.register(marketRoutes, { prefix: '/api/v1' })
}
