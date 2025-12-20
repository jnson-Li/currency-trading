// Import the framework and instantiate it
import 'dotenv/config'
import { buildApp } from './app.js'
import { eth15mManager } from '@/managers/index.js'
import { eth1hManager } from '@/managers/index.js'
const app = await buildApp()

// Declare a route
// fastify.get('/v1/user', async function handler(request, reply) {
//   return { hello: 'world' }
// })

// Run the server!
try {
    await eth15mManager.init()
    await eth1hManager.init()
    await app.listen({ port: 3000 })
    console.log('🚀 Server running at http://localhost:3000')
} catch (err) {
    app.log.error(err)
    process.exit(1)
}
