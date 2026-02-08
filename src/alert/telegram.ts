// src/alert/telegram.ts
import { fetch } from 'undici'
import { stableFetch } from '@/infra/fetch.js'

export async function sendTelegram(token: string, chatId: string, text: string) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'Markdown',
        }),
    })
}
