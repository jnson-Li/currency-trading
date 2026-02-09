// src/metrics/system-health-writer.ts
import fs from 'fs';
import path from 'path';
export function createJsonlWriter(file) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const stream = fs.createWriteStream(file, { flags: 'a' });
    return (obj) => {
        stream.write(JSON.stringify(obj) + '\n');
    };
}
