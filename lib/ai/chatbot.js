/**
 * CODEX AI — always-on chatbot (Groq). Called from lib/messageHandler.js for
 * every non-command message. Returns true when it handled the message.
 *
 * Modes (set with .chatbot mode … or .mode …) — they apply to EVERYONE in the chat:
 *   dm     → answers private chats
 *   group  → in groups: when someone replies to the bot, says "codex", or tags it
 *   tag    → in groups: only when the bot is tagged
 *   all    → dm + group
 * Images, stickers, videos and voice notes follow the same rules.
 */
const engine = require('./engine');
const store = require('./store');
const persona = require('./persona');
const pending = require('./pending');
const intents = require('./intents');
const media = require('./media');
const { getContentType } = require('../baileys');

const NAME_TRIGGER = /\bcodex\b/i;
const VOICE_REQUEST = /\b(voice\s?note|voice\s?message|send.{0,15}voice|reply.{0,15}voice|say it (out loud)?|record.{0,15}voice|audio (note|reply|message))\b/i;
const QUESTION_ABOUT_MEDIA = /\?\s*$|\b(this|that|it|image|photo|pic|picture|video|sticker|him|her|them|they)\b/i;
const _keyWarned = new Map();

const digits = (j) => String(j || '').replace(/:[0-9]+@/, '@').split('@')[0].replace(/[^0-9]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── small helpers ───────────────────────────────────────────────────────────
function quotedOpt(m) { return { quoted: { key: m.key, message: m.message } }; }

function unwrapViewOnce(msg) {
    if (!msg) return msg;
    for (const vt of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
        if (msg[vt]) return msg[vt].message || msg[vt];
    }
    return msg;
}

/** The media (image/sticker/video) the user replied to, if any. */
function quotedMedia(m) {
    const q = m.contextInfo?.quotedMessage;
    if (!q) return null;
    const inner = unwrapViewOnce(q);
    const t = getContentType(inner);
    const kind = { imageMessage: 'image', stickerMessage: 'sticker', videoMessage: 'video' }[t];
    return kind ? { kind, content: inner[t] } : null;
}

function quotedText(m) {
    const q = m.contextInfo?.quotedMessage;
    if (!q) return '';
    return String(q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || '').trim();
}

/** How was the bot addressed in a group?  tag = @mention · reply = replied to the bot's message · name = said "codex" */
async function addressInfo(bot, m, text, helpers) {
    const ids = await helpers.botIdentity(m.chat).catch(() => new Set());
    const isBot = (j) => { const d = digits(j); return !!d && ids.has(d); };
    const mentions = [...(m.mentions || []), ...(m.contextInfo?.mentionedJid || [])];
    const typed = [...(text || '').matchAll(/@(\d{5,})/g)].map((x) => x[1]);
    return {
        tag: mentions.some(isBot) || typed.some((d) => ids.has(d)),
        reply: isBot(m.contextInfo?.participant),
        name: NAME_TRIGGER.test(text || ''),
    };
}

async function typing(bot, jid, on = true) {
    try { await bot.sock.sendPresenceUpdate(on ? 'composing' : 'paused', jid); } catch { /* ignore */ }
}

async function send(bot, jid, content, m, quote = true) {
    return bot.sendMessage(jid, content, quote ? quotedOpt(m) : {});
}

async function warnOwnerNoKey(bot, m, detail) {
    try {
        if (!bot.permission?.isOwner?.(m.sender)) return;
        const last = _keyWarned.get('k') || 0;
        if (Date.now() - last < 2 * 60 * 1000) return;
        _keyWarned.set('k', Date.now());
        await bot.sendMessage(m.chat, { text: `⚠️ Chatbot is on but the AI call failed.\n${detail ? '_' + String(detail).slice(0, 200) + '_\n' : ''}Run ${bot.prefix || '.'}aikeys test` });
    } catch { /* ignore */ }
}

// ── text conversation ───────────────────────────────────────────────────────
async function converse({ bot, m, text, helpers, voiceIn = false }) {
    const s = store.get();
    const jid = m.chat;
    const key = m.isGroup ? 'grp:' + jid : 'dm:' + m.sender;
    if (engine.rateLimited('cb:' + key, 14) || engine.rateLimited('cbu:' + m.sender, 8)) return true;

    const name = m.pushName || digits(m.sender);
    const clean = text.replace(/@\d{5,}/g, '').trim();
    let userContent = m.isGroup ? `${name}: ${clean}` : clean;
    const qt = quotedText(m);
    if (qt) userContent += `\n(they are replying to this message: "${qt.slice(0, 300)}")`;

    let groupName = null;
    if (m.isGroup) groupName = await helpers.groupName(jid).catch(() => null);
    const system = persona.buildSystem(s, { isGroup: m.isGroup, groupName, userName: name });

    await typing(bot, jid, true);
    const res = await engine.chat({
        bot,
        route: engine.chatbotRoute(bot),
        system,
        messages: [...engine.history(key), { role: 'user', content: userContent }],
        maxTokens: 700,
        temperature: 0.8,
    });
    if (!res.ok) {
        await typing(bot, jid, false);
        console.error('[chatbot] AI call failed:', res.error);
        await warnOwnerNoKey(bot, m, res.error);
        return true;
    }
    engine.remember(key, 'user', userContent);
    engine.remember(key, 'assistant', res.text);

    // a short human-ish pause so replies don't feel instant
    await sleep(Math.min(1800, 250 + res.text.length * 8));
    await typing(bot, jid, false);

    const wantsVoice = s.voice === 'on' || (s.voice === 'auto' && voiceIn) || VOICE_REQUEST.test(clean);
    if (wantsVoice) {
        try {
            try { await bot.sock.sendPresenceUpdate('recording', jid); } catch { /* ignore */ }
            const voice = await require('./voice').generate(res.text, bot);
            await typing(bot, jid, false);
            if (voice?.buffer) {
                await send(bot, jid, { audio: voice.buffer, mimetype: voice.mimetype, ptt: voice.ptt }, m, m.isGroup);
                return true;
            }
            console.error('[chatbot] voice reply unavailable (too long or TTS down) — sending text instead');
        } catch (e) { console.error('[chatbot voice reply]', e.message); }
    }
    await send(bot, jid, { text: res.text }, m, m.isGroup);
    return true;
}

// ── voice notes ─────────────────────────────────────────────────────────────
async function handleVoice({ bot, m, helpers }) {
    try {
        const buf = await media.download(m.msg, 'audio');
        if (!buf?.length) return true;
        await typing(bot, m.chat, true);
        const r = await engine.transcribe({ bot, buffer: buf, mimetype: m.msg?.mimetype || 'audio/ogg', toMp3: media.toMp3 });
        if (!r.ok) {
            await typing(bot, m.chat, false);
            if (/not set/i.test(r.error)) { await warnOwnerNoKey(bot, m); return true; }
            await send(bot, m.chat, { text: "Couldn't catch that voice note, say it again?" }, m, m.isGroup);
            return true;
        }
        return await converse({ bot, m, text: r.text, helpers, voiceIn: true });
    } catch (e) {
        console.error('[chatbot voice]', e.message);
        return true;
    }
}

// ── media menus ─────────────────────────────────────────────────────────────
async function offerMenu({ bot, m, kind, content, dlType, pendKey }) {
    const buf = await media.download(content, dlType);
    if (!buf?.length) return true;
    pending.set(pendKey, { kind, buffer: buf, mimetype: content?.mimetype || '' });
    await send(bot, m.chat, { text: intents.menuText(kind) }, m, true);
    return true;
}

/** Runs one action on a media buffer. `extra` = the user's raw words (for "as document", sizes…). */
async function runAction({ bot, m, kind, id, buffer, pendKey, extra = '' }) {
    const jid = m.chat;
    const cfg = bot.config || {};
    const pack = cfg.STICKER_PACKNAME || 'CODEX AI';
    const author = cfg.STICKER_AUTHOR || 'CODEX';
    const reply = (content) => send(bot, jid, content, m, true);
    const fail = (msg) => reply({ text: `❌ ${msg}` });
    const wantsDoc = /\b(document|doc|file)\b/i.test(extra);

    try {
        switch (id) {
            // ── images ──────────────────────────────────────────────
            case 'removebg': {
                await reply({ text: '⏳ Removing the background…' });
                const out = await media.removeBackground(buffer, bot);
                const caption = '*BACKGROUND REMOVED VIA CODEX AI*';
                if (wantsDoc) await reply({ document: out, fileName: `${Math.random().toString(36).slice(2, 7)}_nobg.png`, mimetype: 'image/png', caption });
                else await reply({ image: out, mimetype: 'image/png', caption });
                break;
            }
            case 'sticker':
            case 'psticker':
            case 'rsticker': {
                if (kind === 'video') {
                    const stk = await media.videoToSticker(buffer, { pack, author });
                    await reply(id === 'psticker' ? { sticker: stk, premium: 1 } : { sticker: stk });
                } else {
                    const stk = await media.imageToSticker(buffer, { pack, author, round: id === 'rsticker' });
                    await reply(id === 'psticker' ? { sticker: stk, premium: 1 } : { sticker: stk });
                }
                break;
            }
            case 'ocr': {
                await reply({ text: '🔍 Scanning image for text...' });
                let found = '';
                try { found = await media.ocrSpace(buffer, bot); } catch (e) { console.error('[OCR]', e.message); }
                if (!found) { // second opinion from the vision model, if one is available
                    try {
                        const { base64, mimetype } = await media.toBase64Jpeg(buffer);
                        const r = await engine.vision({
                            bot, imageBase64: base64, mimetype, maxTokens: 1200,
                            prompt: 'Extract ALL text visible in this image exactly as written, keeping line breaks. Output only the text. If there is no readable text, output exactly: NO_TEXT',
                        });
                        if (r.ok && !/^NO_TEXT\b/i.test(r.text)) found = r.text;
                    } catch { /* ignore */ }
                }
                if (!found) return reply({ text: '❌ No text detected in the image.' });
                await reply({ text: `*🔍 OCR RESULT*\n\n${found}` });
                break;
            }
            case 'describe': {
                const { base64, mimetype } = await media.toBase64Jpeg(buffer);
                const r = await engine.vision({
                    bot, imageBase64: base64, mimetype,
                    system: 'You are CODEX AI. Describe images naturally in 2-4 short sentences: main subject, setting, mood, any visible text. Do not invent details.',
                    prompt: kind === 'sticker' ? 'Describe this sticker briefly (subject, expression, style).' : 'Describe this image.',
                });
                if (!r.ok) return fail(visionError(r));
                await reply({ text: r.text });
                break;
            }
            case 'resize': {
                const spec = media.parseResizeSpec(extra);
                if (!spec) {
                    pending.set(pendKey, { kind: 'image', buffer, step: 'resize', tries: 0 });
                    return reply({ text: 'What size? Send something like *800x600*, *50%*, or a preset: *small*, *medium*, *large*, *hd*.' });
                }
                const out = await media.resizeImage(buffer, spec);
                await reply({ image: out.buffer, caption: `✅ Resized to ${out.width}×${out.height}` });
                break;
            }
            case 'bw':
                await reply({ image: await media.blackAndWhite(buffer), caption: '⚫⚪ Black & white' });
                break;
            case 'compress': {
                const out = await media.compress(buffer);
                await reply({ image: out, caption: `🗜️ Compressed: ${(buffer.length / 1024).toFixed(0)} KB → ${(out.length / 1024).toFixed(0)} KB` });
                break;
            }
            case 'document': {
                const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
                await reply({ document: buffer, fileName: `codex_${Date.now()}.${isPng ? 'png' : 'jpg'}`, mimetype: isPng ? 'image/png' : 'image/jpeg' });
                break;
            }

            // ── stickers ────────────────────────────────────────────
            case 'image':
                await reply({ image: await media.stickerToPng(buffer), caption: '✅ Sticker converted to image' });
                break;
            case 'gif': {
                const mp4 = await media.stickerToGifVideo(buffer);
                await reply({ video: mp4, gifPlayback: true, caption: '✅ Converted to GIF' });
                break;
            }
            case 'img_nobg': {
                await reply({ text: '⏳ Converting and removing the background…' });
                const png = await media.stickerToPng(buffer);
                const out = await media.removeBackground(png, bot);
                await reply({ image: out, mimetype: 'image/png', caption: '*BACKGROUND REMOVED VIA CODEX AI*' });
                break;
            }
            case 'repack': {
                const out = await media.repack(buffer, { pack, author });
                await reply({ sticker: out });
                break;
            }

            // ── videos ──────────────────────────────────────────────
            case 'frame': {
                await reply({ image: await media.videoFrame(buffer), caption: '📸 First frame' });
                break;
            }
            case 'audio': {
                const mp3 = await media.audioFromVideo(buffer);
                if (!mp3) return reply({ text: "That video doesn't seem to have any sound." });
                await reply({ audio: mp3, mimetype: 'audio/mpeg' });
                break;
            }
            case 'transcribe': {
                await reply({ text: '🎧 Listening…' });
                const mp3 = await media.audioFromVideo(buffer);
                if (!mp3) return reply({ text: "That video doesn't seem to have any sound." });
                const r = await engine.transcribe({ bot, buffer: mp3, mimetype: 'audio/mpeg', toMp3: null });
                if (!r.ok) return fail("Couldn't transcribe that" + (/not set/i.test(r.error) ? ' — GROQ_API_KEY is missing.' : '.'));
                await reply({ text: `📝 *Transcript:*\n\n${r.text}` });
                break;
            }
            case 'song': {
                const { identifySong, isConfigured } = require('../musicId');
                if (!isConfigured(bot)) return reply({ text: 'Song ID needs a RapidAPI key — owner can set it with .setvar RAPIDAPI_KEY=<key>' });
                await reply({ text: '🎵 Listening for the song…' });
                const mp3 = await media.audioFromVideo(buffer, 25);
                if (!mp3) return reply({ text: "That video doesn't seem to have any sound." });
                const song = await identifySong(bot, mp3);
                if (song?.title) await reply({ text: `🎵 *${song.title}*${song.artist ? ` — ${song.artist}` : ''}` });
                else await reply({ text: "Couldn't match that song." });
                break;
            }
            default:
                return false;
        }
        pending.clear(pendKey);
        return true;
    } catch (e) {
        console.error('[chatbot action]', id, e.message);
        pending.clear(pendKey);
        await fail(e.message && e.message.length < 140 ? e.message : 'Something went wrong with that. Try again?');
        return true;
    }
}

function visionError(r) {
    const e = r.error || '';
    if (/not set|No API key/i.test(e)) return 'Image understanding needs GROQ_API_KEY (or OPENROUTER_API_KEY) to be set.';
    if (/NO_VISION_MODEL/.test(e)) return "Your Groq account has no image-capable model right now. Owner: add OPENROUTER_API_KEY, or run .aikeys test and set AI_MODEL_VISION=<model>.";
    return "I couldn't read that image right now. Try again in a bit.";
}

/** Free-text question about a held image/sticker/video frame. */
async function askAboutMedia({ bot, m, kind, buffer, question }) {
    try {
        let frame = buffer;
        if (kind === 'video') frame = await media.videoFrame(buffer);
        const { base64, mimetype } = await media.toBase64Jpeg(frame);
        await typing(bot, m.chat, true);
        const r = await engine.vision({
            bot, imageBase64: base64, mimetype,
            system: 'You are CODEX AI. Answer the question about the image naturally and briefly, like a person texting. Do not invent details you cannot see.',
            prompt: question + (kind === 'video' ? '\n(This is the first frame of a video.)' : ''),
        });
        await typing(bot, m.chat, false);
        await send(bot, m.chat, { text: r.ok ? r.text : `❌ ${visionError(r)}` }, m, true);
    } catch (e) {
        console.error('[chatbot media question]', e.message);
        await send(bot, m.chat, { text: '❌ I could not look at that one.' }, m, true);
    }
    return true;
}

// ── resolving a pending menu ────────────────────────────────────────────────
async function resolvePending({ bot, m, text, pend, pendKey }) {
    // resize follow-up: waiting for a size
    if (pend.step === 'resize') {
        if (intents.CANCEL.test(text)) { pending.clear(pendKey); await send(bot, m.chat, { text: 'Okay, cancelled.' }, m, true); return true; }
        const spec = media.parseResizeSpec(text);
        if (!spec) {
            const tries = (pend.tries || 0) + 1;
            if (tries >= 3) { pending.clear(pendKey); await send(bot, m.chat, { text: 'No worries, cancelled the resize.' }, m, true); return true; }
            pending.set(pendKey, { ...pend, tries });
            await send(bot, m.chat, { text: 'I need a size like *800x600*, *50%*, or *small / medium / large / hd*.' }, m, true);
            return true;
        }
        return await runAction({ bot, m, kind: 'image', id: 'resize', buffer: pend.buffer, pendKey, extra: text });
    }

    const r = intents.resolve(pend.kind, text);
    if (r?.cancel) { pending.clear(pendKey); await send(bot, m.chat, { text: 'Alright 👍' }, m, true); return true; }
    if (r?.id) return await runAction({ bot, m, kind: pend.kind, id: r.id, buffer: pend.buffer, pendKey, extra: text });

    // not a menu choice → a question about the media, or just normal chat
    if (text.trim().length >= 3 && QUESTION_ABOUT_MEDIA.test(text)) {
        pending.clear(pendKey);
        return await askAboutMedia({ bot, m, kind: pend.kind, buffer: pend.buffer, question: text });
    }
    pending.clear(pendKey);
    return false;
}

// ── entry point ─────────────────────────────────────────────────────────────
/**
 * helpers: { botIdentity(jid) → Set<digits>, groupName(jid) → string|null }
 */
async function handle(bot, m, text, helpers) {
    if (!m || m.key?.fromMe || m.isBot) return false;
    if (!store.activeFor({ isGroup: m.isGroup, chat: m.chat })) return false;

    const s = store.get();
    const type = m.type;
    const isMediaType = ['imageMessage', 'videoMessage', 'stickerMessage', 'audioMessage'].includes(type);
    text = (text || '').trim();
    if (!text && !isMediaType) return false;

    const pendKey = m.chat + ':' + m.sender;
    let pend = pending.get(pendKey);
    // a brand-new media message replaces whatever was pending
    if (pend && isMediaType) { pending.clear(pendKey); pend = null; }

    // Group rules — `.mode group`: reply to the bot / say "codex" / tag it (anyone, not just mods)
    //               `.mode tag`  : only when the bot is tagged
    let addressed = true;
    if (m.isGroup) {
        const a = await addressInfo(bot, m, text, helpers);
        const groupMode = s.modes.includes('group') || !s.modes.includes('tag');
        addressed = groupMode ? (a.tag || a.reply || a.name) : a.tag;
        if (!addressed && !pend) return false;
    }

    // 1) answering a menu we showed
    if (pend && text) {
        const done = await resolvePending({ bot, m, text, pend, pendKey });
        if (done) return true;
    }

    // 2) voice notes (DMs always; groups when replying to / tagging the bot)
    if (type === 'audioMessage') {
        if (!m.msg?.ptt) return false;
        if (m.isGroup && !addressed) return false;
        return await handleVoice({ bot, m, helpers });
    }

    // 3) fresh image / sticker / video → ask what to do (groups: only if addressed)
    if (type === 'imageMessage' || type === 'stickerMessage' || type === 'videoMessage') {
        if (m.isGroup && !addressed) return false;
        const kind = { imageMessage: 'image', stickerMessage: 'sticker', videoMessage: 'video' }[type];
        const dlType = kind;
        try {
            const caption = text.replace(/@\d{5,}/g, '').trim();
            if (caption && kind !== 'sticker') {
                // caption is an instruction ("remove background") or a question about the picture
                const r = intents.resolve(kind, caption);
                if (r?.id) {
                    const buf = await media.download(m.msg, dlType);
                    if (!buf?.length) return true;
                    return await runAction({ bot, m, kind, id: r.id, buffer: buf, pendKey, extra: caption });
                }
                if (caption.length >= 3 && QUESTION_ABOUT_MEDIA.test(caption)) {
                    const buf = await media.download(m.msg, dlType);
                    if (!buf?.length) return true;
                    return await askAboutMedia({ bot, m, kind, buffer: buf, question: caption });
                }
            }
            return await offerMenu({ bot, m, kind, content: m.msg, dlType, pendKey });
        } catch (e) {
            console.error('[chatbot media]', e.message);
            return true;
        }
    }

    // 4) text
    if (!text) return false;
    const clean = text.replace(/@\d{5,}/g, '').trim();

    // replying to a picture/sticker/video with an instruction or question
    if (!m.isGroup || addressed) {
        const qm = quotedMedia(m);
        if (qm && clean) {
            const r = intents.resolve(qm.kind, clean);
            const asks = QUESTION_ABOUT_MEDIA.test(clean);
            if ((r && r.id) || (qm.kind === 'image' && asks && clean.length >= 3)) {
                try {
                    const buf = await media.download(qm.content, qm.kind);
                    if (buf?.length) {
                        if (r?.id) return await runAction({ bot, m, kind: qm.kind, id: r.id, buffer: buf, pendKey, extra: clean });
                        return await askAboutMedia({ bot, m, kind: qm.kind, buffer: buf, question: clean });
                    }
                } catch (e) { console.error('[chatbot quoted media]', e.message); }
            }
        }
    }

    if (!clean) {
        if (addressed) await send(bot, m.chat, { text: 'yeah? 👀' }, m, m.isGroup);
        return true;
    }
    return await converse({ bot, m, text, helpers });
}

module.exports = { handle, converse };
