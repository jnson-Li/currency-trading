import { FastifyInstance } from 'fastify'
import userRoutes from './user.route.js'

export default async function routes(app: FastifyInstance) {
    app.register(userRoutes, { prefix: '/v1' })
}
