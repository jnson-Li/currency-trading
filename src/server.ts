// Import the framework and instantiate it
console.log('[load] server.ts')
import 'dotenv/config'
import { buildApp } from './app.js'
import { ENV } from './config/env.js'
import { bootstrap } from './system/bootstrap.js'

const app = await buildApp()

try {
    await bootstrap('live')

    await app.listen({ port: ENV.PORT })
    console.log('🚀 Server running at http://localhost:3000')
} catch (err) {
    app.log.error(err)
    process.exit(1)
}
