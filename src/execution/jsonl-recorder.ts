// src/execution/jsonl-recorder.ts
import fs from 'node:fs'
import path from 'node:path'

export function createJsonlRecorder(filepath: string) {
    const dir = path.dirname(filepath)
    fs.mkdirSync(dir, { recursive: true })

    return (obj: any) => {
        fs.appendFileSync(filepath, JSON.stringify(obj) + '\n', 'utf8')
    }
}
