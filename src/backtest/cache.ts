import fs from 'fs'
import path from 'path'

export function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

export function readJsonCache<T>(file: string): T | null {
    if (!fs.existsSync(file)) return null
    try {
        const raw = fs.readFileSync(file, 'utf-8')
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

export function writeJsonCache(file: string, data: unknown) {
    ensureDir(path.dirname(file))
    fs.writeFileSync(file, JSON.stringify(data))
}
