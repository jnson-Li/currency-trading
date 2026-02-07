import { getUserSchema, addUserSchema } from '../schemas/user.schema.js';
import { getUsers, addUsers } from '../services/user.service.js';
export default async function userRoutes(app) {
    app.get('/user', {
        schema: getUserSchema,
        handler: async (request) => {
            return {
                msg: 'success',
                data: getUsers(request.query.name),
            };
        },
    });
    app.post('/user', {
        schema: addUserSchema,
        handler: async (request, reply) => {
            addUsers(request.body);
            return { msg: 'user create success!' };
        },
    });
}
