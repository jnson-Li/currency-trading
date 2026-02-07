export const getUserSchema = {
    querystring: {
        type: 'object',
        required: ['name'],
        properties: {
            name: { type: 'string' },
        },
    },
    response: {
        200: {
            type: 'object',
            required: ['msg', 'data'],
            properties: {
                msg: { type: 'string' },
                data: {},
            },
        },
    },
};
export const addUserSchema = {
    body: {
        type: 'object',
        properties: {
            nick: { type: 'string' },
            sex: { type: 'number', enum: [0, 1, 2, 3] },
        },
        required: ['nick'],
    },
    response: {
        200: {
            type: 'object',
            required: ['msg'],
            properties: {
                msg: { type: 'string' },
            },
        },
    },
};
