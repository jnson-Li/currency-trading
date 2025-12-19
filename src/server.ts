// Import the framework and instantiate it

import { buildApp } from './app.js'

const app = await buildApp()

// Declare a route
// fastify.get('/v1/user', async function handler(request, reply) {
//   return { hello: 'world' }
// })

// Run the server!
try {
    await app.listen({ port: 3000 })
    console.log('🚀 Server running at http://localhost:3000')
} catch (err) {
    app.log.error(err)
    process.exit(1)
}
