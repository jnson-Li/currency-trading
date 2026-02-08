// src/utils/fs.ts
import fs from 'fs';
import path from 'path';
export function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
