/**
 * CODEX AI — text → voice note.
 * Tries, in order (first that works wins):
 *   1. Groq Orpheus TTS   (same GROQ_API_KEY — only if your account has it)
 *   2. Google Translate TTS  (free, no key — very reliable)
 *   3. The bot's older TTS service (utils/ttsHelper.js)
 * and converts the result to ogg/opus so WhatsApp shows a real voice bubble.
 * Language for Google TTS: .setvar AI_VOICE_LANG=en  (en, fr, es, pt, ar, hi …)
 */
const engine = require('./engine');
const media = require('./media');

const MAX_CHARS = 500;

function _chunks(text, size = 180) {
    const out = [];
    let rest = String(text).replace(/\s+/g, ' ').trim();
    while (rest.length > size) {
        let cut = Math.max(rest.lastIndexOf('. ', size), rest.lastIndexOf(', ', size), rest.lastIndexOf(' ', size));
        if (cut < size * 0.4) cut = size;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
    return out;
}

function _cleanForSpeech(text) {
    return String(text)
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_~`#>]/g, '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function _get(url, headers = {}, ms = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', ...headers }, signal: ctrl.signal });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length > 800 ? buf : null;
    } catch { return null; } finally { clearTimeout(t); }
}

async function _google(text, lang) {
    const parts = [];
    for (const c of _chunks(text)) {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(c)}`;
        const buf = await _get(url);
        if (!buf) return null;
        parts.push(buf);
    }
    return parts.length ? Buffer.concat(parts) : null; // mp3 frames concatenate cleanly
}

async function _orpheus(bot, text) {
    if (!engine.getKey(bot, 'groq')) return null;
    const key = engine.getKey(bot, 'groq');
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 25000);
        const res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: bot?.config?.AI_MODEL_TTS || 'canopylabs/orpheus-v1-english',
                voice: bot?.config?.AI_VOICE || 'hannah',
                input: text.slice(0, 190),
                response_format: 'wav',
            }),
            signal: ctrl.signal,
        }).finally(() => clearTimeout(t));
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length > 800 ? buf : null;
    } catch { return null; }
}

/** → { buffer, mimetype, ptt } or null. Text longer than MAX_CHARS returns null (send text instead). */
async function generate(text, bot) {
    const clean = _cleanForSpeech(text);
    if (!clean || clean.length > MAX_CHARS) return null;
    const lang = bot?.config?.AI_VOICE_LANG || 'en';

    if (clean.length <= 190) {
        const wav = await _orpheus(bot, clean);
        if (wav) { const o = await media.toOpus(wav, 'wav'); if (o) return { buffer: o, mimetype: 'audio/ogg; codecs=opus', ptt: true }; }
    }
    const mp3 = await _google(clean, lang);
    if (mp3) {
        const o = await media.toOpus(mp3, 'mp3');
        if (o) return { buffer: o, mimetype: 'audio/ogg; codecs=opus', ptt: true };
        return { buffer: mp3, mimetype: 'audio/mpeg', ptt: false };
    }
    try {
        const { generateVoice } = require('../../utils/ttsHelper');
        const v = await Promise.race([generateVoice(clean), new Promise((r) => setTimeout(() => r(null), 20000))]);
        if (v?.buffer) return { buffer: v.buffer, mimetype: v.mimetype || 'audio/ogg; codecs=opus', ptt: true };
    } catch { /* fall through */ }
    return null;
}

module.exports = { generate, MAX_CHARS, _chunks, _cleanForSpeech };
