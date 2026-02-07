// src/execution/jsonl-recorder.ts
import fs from 'node:fs';
import path from 'node:path';
export function createJsonlRecorder(filepath) {
    const dir = path.dirname(filepath);
    fs.mkdirSync(dir, { recursive: true });
    return (obj) => {
        fs.appendFileSync(filepath, JSON.stringify(obj) + '\n', 'utf8');
    };
}
