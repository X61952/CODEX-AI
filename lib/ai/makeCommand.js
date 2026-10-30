/**
 * Builds one of the 12 AI commands from lib/ai/models.js.
 * Each file in commands/ai/ is just:  module.exports = require('../../lib/ai/makeCommand')('gemini');
 */
const { MODELS } = require('./models');
const engine = require('./engine');
const media = require('./media');
const { getContentType } = require('../baileys');

const SYSTEM =
    'You are replying inside WhatsApp. Be clear and accurate. Use WhatsApp formatting only (*bold*, _italic_, ```code```), ' +
    'never Markdown headings or tables. Keep answers concise unless the user asks for detail.';

/** System prompt used when the command's own model can't be reached: same key, that model's style. */
function personaFor(def) {
    return `You are ${def.label}, an AI assistant inside the CODEX AI WhatsApp bot. Answer in the natural style of ${def.label}: ${def.style}. ` +
        `If someone asks who or what you are, say you are ${def.label} on CODEX AI. Never mention fallbacks, other models or API providers. ` +
        SYSTEM;
}

/** Markdown → WhatsApp-friendly text. */
function toWhatsApp(text) {
    return String(text)
        .replace(/^#{1,6}\s*(.+)$/gm, '*$1*')
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .replace(/__(.+?)__/g, '_$1_')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .trim();
}

function chunk(text, size = 3800) {
    if (text.length <= size) return [text];
    const out = [];
    let rest = text;
    while (rest.length > size) {
        let cut = rest.lastIndexOf('\n\n', size);
        if (cut < size * 0.5) cut = rest.lastIndexOf('\n', size);
        if (cut < size * 0.5) cut = rest.lastIndexOf(' ', size);
        if (cut < 1) cut = size;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
    return out;
}

function findImage(m) {
    if (m.type === 'imageMessage' && m.msg) return { content: m.msg, type: 'image' };
    const q = m.contextInfo?.quotedMessage;
    if (q) {
        let inner = q;
        for (const vt of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
            if (q[vt]) { inner = q[vt].message || q[vt]; break; }
        }
        const t = getContentType(inner);
        if (t === 'imageMessage') return { content: inner[t], type: 'image' };
        if (t === 'stickerMessage') return { content: inner[t], type: 'sticker' };
    }
    return null;
}

function quotedText(m) {
    const q = m.contextInfo?.quotedMessage;
    if (!q) return '';
    return String(q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '').trim();
}

module.exports = function makeAiCommand(key) {
    const def = MODELS[key];
    if (!def) throw new Error('Unknown AI model: ' + key);

    return {
        name: key,
        aliases: def.aliases,
        category: 'ai',
        description: `Ask ${def.label} (${def.info})`,
        usage: `.${key} <question>  — or reply to a message / image`,

        async execute(bot, m, args) {
            const prefix = bot.prefix || '.';
            const typed = args.join(' ').trim();
            const quoted = quotedText(m);
            const image = findImage(m);

            if (!typed && !quoted && !image) {
                return await m.reply(
                    `${def.symbol} *${def.label}* — ${def.info}\n\n` +
                    `Usage: *${prefix}${key} <question>*\n` +
                    `Or reply to a message${def.vision ? ' / image' : ''} with *${prefix}${key}*\n\n` +
                    `Example: ${prefix}${key} explain recursion in simple words`
                );
            }
            if (engine.rateLimited('cmd:' + m.sender, 6)) {
                return await m.reply('⏳ Slow down a little — try again in a minute.');
            }

            const prompt = typed || (image ? 'Describe this image.' : `Reply to this:\n${quoted}`);
            const fullPrompt = typed && quoted ? `${typed}\n\n(Message being replied to:\n"${quoted.slice(0, 1500)}")` : prompt;

            let res;
            if (image) {
                let b64;
                try {
                    const buf = await media.download(image.content, image.type);
                    b64 = await media.toBase64Jpeg(buf);
                } catch {
                    return await m.reply('❌ Could not read that image.');
                }
                res = await engine.vision({
                    bot, imageBase64: b64.base64, mimetype: b64.mimetype,
                    prompt: fullPrompt, system: SYSTEM, fallbackSystem: personaFor(def),
                    preferredOr: def.vision ? (bot.config?.[`AI_MODEL_${key.toUpperCase()}`] || def.or) : null,
                    maxTokens: 1400,
                });
            } else {
                res = await engine.chat({
                    bot,
                    route: engine.routeFor(bot, key),
                    system: SYSTEM,
                    fallbackSystem: personaFor(def),
                    messages: [{ role: 'user', content: fullPrompt }],
                    maxTokens: 1600,
                });
            }

            if (!res.ok) {
                const noKey = /not set|No API key/i.test(res.error || '');
                if (!noKey) console.error(`[AI .${key}]`, res.error);
                return await m.reply(noKey
                    ? `⚠️ AI keys are not set yet.\nOwner: add *GROQ_API_KEY* and *OPENROUTER_API_KEY* — check with ${prefix}aikeys`
                    : `❌ ${def.label} couldn't answer right now. Try again in a moment.`);
            }

            // Backup-route answers look exactly like normal ones; only the console logs it.
            if (res.degraded) console.log(`[AI .${key}] answered via backup model ${res.model}`);
            const parts = chunk(toWhatsApp(res.text));
            for (let i = 0; i < parts.length; i++) {
                const head = i === 0 ? `${def.symbol} *${def.label}*\n\n` : '';
                await m.reply(head + parts[i]);
            }
        },
    };
};

module.exports.toWhatsApp = toWhatsApp;
module.exports.chunk = chunk;
