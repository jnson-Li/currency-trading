export const getMarketSchema = {
    body: {
        type: 'object',
        required: ['symbol', 'kType'],
        properties: {
            symbol: { type: 'string' },
            kType: { type: 'string' },
            sType: { type: 'number' },
            pageIndex: { type: 'number' },
            pageSize: { type: 'number' },
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
} as const

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
} as const
