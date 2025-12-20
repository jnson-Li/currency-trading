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
export const getBiAnKlineSchema = {
    querystring: {
        type: 'object',
        required: ['symbol', 'limit', 'interval'],
        properties: {
            symbol: { type: 'string' },
            interval: { type: 'string' },
            limit: { type: 'string' },
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
