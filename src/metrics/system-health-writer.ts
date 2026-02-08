// src/metrics/system-health-writer.ts
import fs from 'fs'
import path from 'path'

export function createJsonlWriter(file: string) {
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }

    const stream = fs.createWriteStream(file, { flags: 'a' })

    return (obj: any) => {
        stream.write(JSON.stringify(obj) + '\n')
    }
}
