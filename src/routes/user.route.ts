import { FastifyInstance } from 'fastify'
import { getUserSchema, addUserSchema } from '../schemas/user.schema.js'
import { getUsers, addUsers } from '../services/user.service.js'
import { CreateUserDTO } from '../types/user.js'

export default async function userRoutes(app: FastifyInstance) {
    app.get<{
        Querystring: {
            name: string
        }
    }>('/user', {
        schema: getUserSchema,
        handler: async (request) => {
            return {
                msg: 'success',
                data: getUsers(request.query.name),
            }
        },
    })
    app.post<{
        Body: CreateUserDTO
    }>('/user', {
        schema: addUserSchema,
        handler: async (request, reply) => {
            addUsers(request.body)
            return { msg: 'user create success!' }
        },
    })
}
