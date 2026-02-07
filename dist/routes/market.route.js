import { fetchNewKline, fetchBiAnKline } from '../services/market.service.js';
import { getMarketSchema, getBiAnKlineSchema } from '../schemas/user.market.js';
export default async function marketRoutes(app) {
    app.post('/kline', {
        schema: getMarketSchema,
        handler: async (request) => {
            const data = await fetchNewKline(request.body);
            return { msg: 'success', data };
        },
    });
    app.get('/kline', {
        schema: getBiAnKlineSchema,
        handler: async (request) => {
            const data = await fetchBiAnKline(request.query);
            return { msg: 'success', data };
        },
    });
}
