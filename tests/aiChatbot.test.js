// CODEX AI rewrite — engine, 12 commands, chatbot (modes/training/media menus), developers.
// Run: node tests/aiChatbot.test.js   (no WhatsApp, no real network: a local mock API stands in for Groq/OpenRouter)
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-ai-test-'));
process.env.CODEX_PROJECT_ROOT = root;

// Fake lib/baileys (no Baileys install needed)
const baileysPath = require.resolve('../lib/baileys.js', { paths: [__dirname] });
require.cache[baileysPath] = { id: baileysPath, filename: baileysPath, loaded: true, exports: {
    getContentType: (msg) => msg && Object.keys(msg).find((k) => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage'),
    downloadContentFromMessage: async () => { throw new Error('download is stubbed in tests'); },
} };

const fsxPath = path.join(__dirname, '..', 'node_modules', 'fs-extra', 'index.js');
try { require.resolve('fs-extra'); } catch {
    const Module = require('module');
    const orig = Module._resolveFilename;
    Module._resolveFilename = function (req, ...r) { return req === 'fs-extra' ? require.resolve('./_stubs/fs-extra.js') : orig.call(this, req, ...r); };
}
const sharp = require('sharp');
const engine = require('../lib/ai/engine');
const { MODELS } = require('../lib/ai/models');
const store = require('../lib/ai/store');
const keysMod = require('../lib/ai/keys');
const BUILTIN = { ...keysMod.DEFAULT_KEYS };
const noBuiltin = () => { for (const k of Object.keys(keysMod.DEFAULT_KEYS)) keysMod.DEFAULT_KEYS[k] = ''; };
const restoreBuiltin = () => Object.assign(keysMod.DEFAULT_KEYS, BUILTIN);
noBuiltin(); // tests control keys explicitly via bot.config
const persona = require('../lib/ai/persona');
const media = require('../lib/ai/media');
const pending = require('../lib/ai/pending');
const chatbot = require('../lib/ai/chatbot');

let passed = 0;
async function check(label, fn) {
    try { await fn(); passed++; console.log(`  ok - ${label}`); }
    catch (e) { console.error(`  FAIL - ${label}\n    ${e.stack || e.message}`); process.exitCode = 1; }
}

// ── mock AI server ──────────────────────────────────────────────────────────
const calls = [];
let MODELS_LIST = null;
let PNG;
const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
        const raw = Buffer.concat(chunks);
        const isJson = (req.headers['content-type'] || '').includes('json');
        const body = isJson ? JSON.parse(raw.toString() || '{}') : { multipart: raw.toString('latin1') };
        calls.push({ url: req.url, auth: req.headers.authorization, body });
        const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
        if (req.method === 'GET' && req.url === '/g/v1/models') return send(MODELS_LIST ? 200 : 404, { data: (MODELS_LIST || []).map((id) => ({ id })) });
        if (req.url.endsWith('/audio/transcriptions')) return send(200, { text: 'what is the weather like' });
        if (req.url === '/removebg') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG); }
        if (req.url.endsWith('/chat/completions')) {
            const model = body.model;
            if (model === 'google/gemini-2.5-flash' && req.url.startsWith('/or/')) return send(500, { error: { message: 'boom' } });
            const lastContent = body.messages[body.messages.length - 1].content;
            const hasImage = Array.isArray(lastContent) && lastContent.some((p) => p.type === 'image_url');
            let reply = `<think>hidden</think>hello from ${model}`;
            if (hasImage) {
                const q = lastContent.find((p) => p.type === 'text').text;
                reply = /Extract ALL text/.test(q) ? 'INVOICE 42' : 'a red square';
            }
            return send(200, { choices: [{ message: { content: reply } }] });
        }
        send(404, { error: { message: 'nope' } });
    });
});

function mkBot(extra = {}) {
    engine.resetRateLimits();
    const sent = [];
    const bot = {
        prefix: '.',
        config: { GROQ_API_KEY: 'gsk_testtesttesttest', OPENROUTER_API_KEY: 'sk-or-testtesttest', REMOVEBG_API: null, STICKER_PACKNAME: 'PACK', STICKER_AUTHOR: 'AUTH', ...extra },
        sent,
        sock: { sendPresenceUpdate: async () => {}, sendMessage: async (jid, c) => { sent.push({ jid, c }); return {}; } },
        sendMessage: async (jid, c, o) => { sent.push({ jid, c, o }); return {}; },
        permission: { isOwner: (s) => s === 'owner@s.whatsapp.net', isAdmin: async () => false },
    };
    return bot;
}
const helpers = { botIdentity: async () => new Set(['2349000000000']), groupName: async () => 'Test Group' };
let idc = 0;
function mkMsg(o = {}) {
    const isGroup = !!o.isGroup;
    return {
        key: { id: 'A' + (++idc), remoteJid: o.chat || (isGroup ? '120@g.us' : 'user@s.whatsapp.net'), fromMe: false },
        message: {}, chat: o.chat || (isGroup ? '120@g.us' : 'user@s.whatsapp.net'), sender: o.sender || 'user@s.whatsapp.net',
        isGroup, isBot: false, pushName: 'Tester', type: o.type || 'conversation', msg: o.msg || {},
        mentions: o.mentions || [], contextInfo: o.contextInfo || {}, text: o.text || '',
        reply: async () => {},
    };
}
const texts = (bot) => bot.sent.map((s) => s.c.text).filter(Boolean);

(async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    engine.PROVIDERS.groq.base = base + '/g/v1';
    engine.PROVIDERS.openrouter.base = base + '/or/v1';
    PNG = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const rbgUrl = base + '/removebg';

    console.log('registry');
    await check('exactly 12 AI commands, all with files', () => {
        assert.strictEqual(Object.keys(MODELS).length, 12);
        for (const k of Object.keys(MODELS)) {
            const cmd = require(`../commands/ai/${k}.js`);
            assert.strictEqual(cmd.name, k); assert.strictEqual(cmd.category, 'ai'); assert.ok(cmd.execute);
        }
        assert.strictEqual(fs.readdirSync(path.join(__dirname, '../commands/ai')).filter((f) => f.endsWith('.js')).length, 12);
        for (const k of ['gemini', 'gptmini', 'openai', 'gpt5plus']) assert.ok(MODELS[k]);
    });
    await check('no alias collides inside the registry', () => {
        const seen = new Set();
        for (const [k, d] of Object.entries(MODELS)) for (const n of [k, ...d.aliases]) { assert.ok(!seen.has(n), 'dup ' + n); seen.add(n); }
    });

    console.log('engine');
    await check('routeFor: OpenRouter first, Groq fallback; groq-native stays on groq', () => {
        const bot = mkBot();
        const r = engine.routeFor(bot, 'gemini');
        assert.deepStrictEqual([r[0].provider, r[0].model], ['openrouter', 'google/gemini-2.5-flash']);
        assert.ok(r.slice(1).every((x) => x.provider === 'groq' && x.fallback));
        assert.strictEqual(engine.routeFor(bot, 'gptoss')[0].provider, 'groq');
        assert.deepStrictEqual(engine.routeFor(bot, 'qwen').slice(0, 2).map((x) => x.provider), ['groq', 'openrouter']);
        const noOr = engine.routeFor(mkBot({ OPENROUTER_API_KEY: '' }), 'gemini');
        assert.ok(noOr.every((x) => x.provider === 'groq'));
        assert.ok(engine.routeFor(mkBot({ OPENAI_API_KEY: 'sk-openaiopenai' }), 'gptmini').every((x) => x.provider !== 'openai'), 'OpenAI direct is not used');
        assert.strictEqual(engine.getKey(mkBot({ GROQ_API_KEY: 'sk-not-a-groq-key-1234' }), 'groq'), '', 'groq key must start with gsk_');
        const ov = engine.routeFor(mkBot({ AI_MODEL_GEMINI: 'google/custom' }), 'gemini');
        assert.strictEqual(ov[0].model, 'google/custom');
    });
    await check('chat: strips <think>, sends bearer key', async () => {
        const bot = mkBot();
        const r = await engine.chat({ bot, route: engine.routeFor(bot, 'gptoss'), messages: [{ role: 'user', content: 'hi' }] });
        assert.ok(r.ok); assert.strictEqual(r.text, 'hello from openai/gpt-oss-120b'); assert.strictEqual(r.degraded, false);
        assert.strictEqual(calls[calls.length - 1].auth, 'Bearer gsk_testtesttesttest');
    });
    await check('chat: failing OpenRouter model falls back to Groq and is flagged degraded', async () => {
        const bot = mkBot();
        const r = await engine.chat({ bot, route: engine.routeFor(bot, 'gemini'), messages: [{ role: 'user', content: 'hi' }] });
        assert.ok(r.ok && r.degraded && r.provider === 'groq');
    });
    await check('chat: no keys → clear error, no crash', async () => {
        noBuiltin();
        const bot = mkBot({ GROQ_API_KEY: '', OPENROUTER_API_KEY: '' });
        const saved = { g: process.env.GROQ_API_KEY, o: process.env.OPENROUTER_API_KEY };
        delete process.env.GROQ_API_KEY; delete process.env.OPENROUTER_API_KEY;
        const r = await engine.chat({ bot, route: engine.routeFor(bot, 'gemini'), messages: [{ role: 'user', content: 'hi' }] });
        assert.ok(!r.ok && /key/i.test(r.error));
        restoreBuiltin();
        const r2 = await engine.chat({ bot, route: engine.routeFor(bot, 'llama'), messages: [{ role: 'user', content: 'hi' }] });
        assert.ok(r2.ok, 'built-in keys make it work with an empty config');
        noBuiltin();
        Object.assign(process.env, Object.fromEntries(Object.entries({ GROQ_API_KEY: saved.g, OPENROUTER_API_KEY: saved.o }).filter(([, v]) => v)));
    });
    await check('transcribe: multipart upload to Groq whisper', async () => {
        const r = await engine.transcribe({ bot: mkBot(), buffer: Buffer.from('OggS-fake-audio'), mimetype: 'audio/ogg' });
        assert.ok(r.ok); assert.strictEqual(r.text, 'what is the weather like');
        const c = calls[calls.length - 1];
        assert.ok(c.url === '/g/v1/audio/transcriptions' && /whisper-large-v3-turbo/.test(c.body.multipart));
    });
    await check('memory: remembers, trims, clears', () => {
        engine.clearMemory();
        for (let i = 0; i < 30; i++) engine.remember('k1', 'user', 'm' + i);
        assert.strictEqual(engine.history('k1').length, 16);
        engine.clearMemory('k1'); assert.strictEqual(engine.history('k1').length, 0);
        engine.remember('grp:1', 'user', 'a'); engine.remember('grp:2', 'user', 'b'); engine.clearMemory('grp:*');
        assert.strictEqual(engine.memoryCount('grp:1') + engine.memoryCount('grp:2'), 0);
    });

    await check('account without gpt-oss-120b: auto-picks a Groq model the account HAS', async () => {
        MODELS_LIST = ['openai/gpt-oss-20b', 'whisper-large-v3'];
        engine.resetModelCache();
        const bot = mkBot();
        const r = await engine.chat({ bot, route: engine.chatbotRoute(bot), messages: [{ role: 'user', content: 'hi' }] });
        assert.ok(r.ok && r.model === 'openai/gpt-oss-20b', r.model);
        assert.strictEqual(calls[calls.length - 1].body.reasoning_effort, 'low');
        const q = await engine.chat({ bot: mkBot({ OPENROUTER_API_KEY: '' }), route: engine.routeFor(bot, 'qwen'), messages: [{ role: 'user', content: 'hi' }] });
        assert.ok(q.ok && q.degraded);
        MODELS_LIST = null;
        engine.resetModelCache();
    });

    console.log('store + persona');
    await check('parseModes', () => {
        assert.deepStrictEqual(store.parseModes(['dm']), ['dm']);
        assert.deepStrictEqual(store.parseModes(['group']), ['group']);
        assert.deepStrictEqual(store.parseModes(['dm', 'tag']), ['dm', 'tag']);
        assert.deepStrictEqual(store.parseModes(['all']).sort(), ['dm', 'group']);
        assert.strictEqual(store.parseModes(['banana']), null);
    });
    await check('default training says who/when; custom train + default keeps custom saved', () => {
        const d = persona.buildSystem({ useDefault: true, customTrain: 'You are Zara.' }, {});
        assert.ok(/CODEX AI/.test(d) && /X61952/.test(d) && /August 26 Friday 2026 8pm/.test(d) && !/You are Zara/.test(d));
        const c = persona.buildSystem({ useDefault: false, customTrain: 'You are Zara.' }, {});
        assert.ok(/You are Zara\./.test(c) && !/X61952/.test(c));
        assert.ok(/Current date\/time/.test(c));
    });

    console.log('chatbot: gating + modes');
    const reset = () => { try { fs.unlinkSync(store.FILE); } catch {} delete require.cache[require.resolve('../lib/ai/store')]; };
    await check('off by default → ignores everything', async () => {
        const bot = mkBot();
        assert.strictEqual(await chatbot.handle(bot, mkMsg({ text: 'hi' }), 'hi', helpers), false);
        assert.strictEqual(bot.sent.length, 0);
    });
    store.update((d) => { d.enabled = true; d.modes = ['dm']; });
    await check('DM mode answers a DM with human-sized reply and no quote', async () => {
        const bot = mkBot();
        const ok = await chatbot.handle(bot, mkMsg({ text: 'hey there' }), 'hey there', helpers);
        assert.ok(ok); assert.deepStrictEqual(texts(bot), ['hello from openai/gpt-oss-120b']);
        const sysMsg = calls[calls.length - 1].body.messages[0];
        assert.ok(sysMsg.role === 'system' && /CODEX AI/.test(sysMsg.content) && /X61952/.test(sysMsg.content));
    });
    await check('DM mode ignores groups; group mode = reply / "codex" / tag; tag mode = tag only', async () => {
        const bot = mkBot();
        assert.strictEqual(await chatbot.handle(bot, mkMsg({ isGroup: true, text: 'codex hi' }), 'codex hi', helpers), false, 'dm-only: groups ignored');
        store.update((d) => { d.modes = ['group']; });
        assert.strictEqual(await chatbot.handle(bot, mkMsg({ isGroup: true, text: 'anyone up?' }), 'anyone up?', helpers), false, 'plain chatter ignored');
        assert.ok(await chatbot.handle(bot, mkMsg({ isGroup: true, text: 'codex are you there' }), 'codex are you there', helpers), 'name');
        assert.ok(await chatbot.handle(bot, mkMsg({ isGroup: true, text: 'hey', mentions: ['2349000000000@s.whatsapp.net'] }), 'hey', helpers), 'tag');
        assert.ok(await chatbot.handle(bot, mkMsg({ isGroup: true, sender: 'someone@s.whatsapp.net', text: 'what do you think', contextInfo: { participant: '2349000000000@s.whatsapp.net' } }), 'what do you think', helpers), 'reply, any member');
        assert.strictEqual(texts(bot).length, 3);
        assert.ok(bot.sent[0].o?.quoted, 'group replies quote the message');
        // tag mode: ONLY a tag
        store.update((d) => { d.modes = ['tag']; });
        const bot2 = mkBot();
        assert.strictEqual(await chatbot.handle(bot2, mkMsg({ isGroup: true, text: 'codex hello' }), 'codex hello', helpers), false, 'name does not count in tag mode');
        assert.strictEqual(await chatbot.handle(bot2, mkMsg({ isGroup: true, text: 'reply', contextInfo: { participant: '2349000000000@s.whatsapp.net' } }), 'reply', helpers), false, 'reply does not count in tag mode');
        assert.ok(await chatbot.handle(bot2, mkMsg({ isGroup: true, text: '@2349000000000 hello' }), '@2349000000000 hello', helpers), 'typed @number tag counts');
        assert.ok(await chatbot.handle(bot2, mkMsg({ isGroup: true, text: 'hello', mentions: ['2349000000000@s.whatsapp.net'] }), 'hello', helpers), 'mention counts');
    });
    await check('group/tag modes never answer unaddressed chatter, even many messages', async () => {
        store.update((d) => { d.modes = ['group']; });
        const bot = mkBot();
        for (const t of ['lol', 'who won the match', 'good morning everyone']) assert.strictEqual(await chatbot.handle(bot, mkMsg({ isGroup: true, text: t }), t, helpers), false);
        assert.strictEqual(bot.sent.length, 0);
    });
    await check('per-group override: off in one group even when master is on', async () => {
        store.update((d) => { d.modes = ['group']; d.chats['999@g.us'] = false; });
        const bot = mkBot();
        assert.strictEqual(await chatbot.handle(bot, mkMsg({ isGroup: true, chat: '999@g.us', text: 'codex hello all' }), 'codex hello all', helpers), false);
    });
    await check('ignores other bots and its own messages', async () => {
        store.update((d) => { d.modes = ['dm']; });
        const bot = mkBot();
        const m1 = mkMsg({ text: 'hi' }); m1.isBot = true;
        const m2 = mkMsg({ text: 'hi' }); m2.key.fromMe = true;
        assert.strictEqual(await chatbot.handle(bot, m1, 'hi', helpers), false);
        assert.strictEqual(await chatbot.handle(bot, m2, 'hi', helpers), false);
    });
    await check('custom training is used, then .default returns to built-in', async () => {
        store.update((d) => { d.modes = ['dm']; d.customTrain = 'You are Zara the pirate.'; d.useDefault = false; });
        const bot = mkBot();
        await chatbot.handle(bot, mkMsg({ text: 'who are you', sender: 'u2@s.whatsapp.net', chat: 'u2@s.whatsapp.net' }), 'who are you', helpers);
        assert.ok(/Zara the pirate/.test(calls[calls.length - 1].body.messages[0].content));
        store.update((d) => { d.useDefault = true; });
        await chatbot.handle(bot, mkMsg({ text: 'and now', sender: 'u2@s.whatsapp.net', chat: 'u2@s.whatsapp.net' }), 'and now', helpers);
        const sys = calls[calls.length - 1].body.messages[0].content;
        assert.ok(/X61952/.test(sys) && !/Zara/.test(sys));
        assert.strictEqual(store.get().customTrain, 'You are Zara the pirate.', 'custom text stays saved');
    });

    console.log('chatbot: voice notes');
    await check('voice note is transcribed then answered', async () => {
        store.update((d) => { d.modes = ['dm']; d.voice = 'off'; });
        media.download = async () => Buffer.from('OggS-fake');
        const bot = mkBot();
        const m = mkMsg({ type: 'audioMessage', msg: { ptt: true, mimetype: 'audio/ogg; codecs=opus' } });
        assert.ok(await chatbot.handle(bot, m, '', helpers));
        assert.deepStrictEqual(texts(bot), ['hello from openai/gpt-oss-120b']);
        const userTurn = calls[calls.length - 1].body.messages.slice(-1)[0].content;
        assert.strictEqual(userTurn, 'what is the weather like');
    });

    media.ocrSpace = async () => 'INVOICE 42';
    await check('voice: off=text, auto=voice-only for voice notes, falls back to text if TTS fails', async () => {
        const voice = require('../lib/ai/voice');
        const orig = voice.generate;
        voice.generate = async () => ({ buffer: Buffer.from('OggS-x'), mimetype: 'audio/ogg; codecs=opus', ptt: true });
        store.update((d) => { d.modes = ['dm']; d.voice = 'auto'; });
        media.download = async () => Buffer.from('OggS-fake');
        let bot = mkBot();
        await chatbot.handle(bot, mkMsg({ type: 'audioMessage', msg: { ptt: true } }), '', helpers);
        assert.ok(bot.sent.length === 1 && bot.sent[0].c.audio && bot.sent[0].c.ptt === true, 'voice note in → voice note only out');
        bot = mkBot();
        await chatbot.handle(bot, mkMsg({ text: 'hello there friend' }), 'hello there friend', helpers);
        assert.ok(bot.sent.length === 1 && bot.sent[0].c.text, 'typed message in auto → text');
        store.update((d) => { d.voice = 'off'; });
        bot = mkBot();
        await chatbot.handle(bot, mkMsg({ type: 'audioMessage', msg: { ptt: true } }), '', helpers);
        assert.ok(bot.sent[0].c.text && !bot.sent[0].c.audio, 'off → text even for voice notes');
        store.update((d) => { d.voice = 'on'; });
        voice.generate = async () => null;
        bot = mkBot();
        await chatbot.handle(bot, mkMsg({ text: 'say something nice' }), 'say something nice', helpers);
        assert.ok(bot.sent[0].c.text, 'TTS down → still answers in text');
        voice.generate = orig; store.update((d) => { d.voice = 'off'; });
    });
    await check('voice helper: chunking + cleanup + length guard', async () => {
        const v = require('../lib/ai/voice');
        const parts = v._chunks('Hello there. '.repeat(40));
        assert.ok(parts.length > 1 && parts.every((x) => x.length <= 190));
        assert.strictEqual(v._cleanForSpeech('Hi *bold* 😀 https://x.com ok'), 'Hi bold ok');
        assert.strictEqual(await v.generate('x'.repeat(600), mkBot()), null);
    });

    console.log('chatbot: image menu + abilities');
    const imgMsg = (text = '') => mkMsg({ type: 'imageMessage', msg: { mimetype: 'image/png' }, text });
    await check('image → asks with the full menu', async () => {
        media.download = async () => PNG;
        const bot = mkBot();
        assert.ok(await chatbot.handle(bot, imgMsg(), '', helpers));
        const t = texts(bot)[0];
        for (const s of ['Remove background', 'Convert to sticker', 'Convert to premium sticker', 'Convert to round sticker', 'Scan the image', 'Describe the image', 'Resize the image']) assert.ok(t.includes(s), s);
    });
    async function menuThen(reply, botExtra) {
        media.download = async () => PNG;
        const bot = mkBot(botExtra);
        await chatbot.handle(bot, imgMsg(), '', helpers);
        bot.sent.length = 0;
        await chatbot.handle(bot, mkMsg({ text: reply }), reply, helpers);
        return bot;
    }
    const hasExif = async () => { try { require('../library/exif'); return true; } catch { return false; } };
    if (await hasExif()) {
        await check('"2" / "sticker" → sticker with pack metadata; premium adds premium flag', async () => {
            let bot = await menuThen('2');
            assert.ok(bot.sent.some((s) => s.c.sticker), 'sticker sent');
            bot = await menuThen('convert to premium sticker');
            assert.ok(bot.sent.some((s) => s.c.sticker && s.c.premium === 1));
        });
        await check('round sticker is actually round (transparent corners)', async () => {
            const stk = await media.imageToSticker(PNG, { pack: 'P', author: 'A', round: true });
            const { data, info } = await sharp(stk).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            assert.strictEqual(data[3], 0, 'top-left corner transparent');
            const c = ((info.height >> 1) * info.width + (info.width >> 1)) * 4;
            assert.strictEqual(data[c + 3], 255, 'centre opaque');
            const flat = await media.imageToSticker(PNG, { pack: 'P', author: 'A' });
            assert.ok((await sharp(flat).metadata()).width === 512);
        });
    } else console.log('  skip - sticker tests (library/exif deps not installed here)');
    await check('"1" → remove background via your API, caption kept', async () => {
        const bot = await menuThen('1', { REMOVEBG_API: rbgUrl });
        const img = bot.sent.find((s) => s.c.image);
        assert.ok(img && img.c.caption === '*BACKGROUND REMOVED VIA CODEX AI*');
        const bot2 = await menuThen('remove the background as a document', { REMOVEBG_API: rbgUrl });
        const doc = bot2.sent.find((s) => s.c.document);
        assert.ok(doc && /_nobg\.png$/.test(doc.c.fileName));
    });
    await check('scan → returns text; describe → description', async () => {
        let bot = await menuThen('scan the text');
        assert.ok(texts(bot).some((t) => t.includes('INVOICE 42')));
        bot = await menuThen('describe it');
        assert.ok(texts(bot).includes('a red square'));
    });
    await check('resize asks for size, then resizes', async () => {
        media.download = async () => PNG;
        const bot = mkBot();
        await chatbot.handle(bot, imgMsg(), '', helpers);
        await chatbot.handle(bot, mkMsg({ text: 'resize' }), 'resize', helpers);
        assert.ok(texts(bot).some((t) => /What size/.test(t)));
        await chatbot.handle(bot, mkMsg({ text: '320x240' }), '320x240', helpers);
        const out = bot.sent.find((s) => s.c.image && /Resized/.test(s.c.caption));
        const meta = await sharp(out.c.image).metadata();
        assert.deepStrictEqual([meta.width, meta.height], [320, 240]);
    });
    await check('resize "50%" given up-front, black & white, compress, document', async () => {
        let bot = await menuThen('resize to 50%');
        assert.ok((await sharp(bot.sent.find((s) => s.c.image).c.image).metadata()).width === 320);
        bot = await menuThen('black and white');
        const bw = await sharp(bot.sent.find((s) => s.c.image).c.image).stats();
        assert.ok(Math.abs(bw.channels[0].mean - bw.channels[1].mean) < 2);
        bot = await menuThen('compress');
        assert.ok(bot.sent.some((s) => s.c.image && /Compressed/.test(s.c.caption)));
        bot = await menuThen('10');
        assert.ok(bot.sent.some((s) => s.c.document && s.c.mimetype === 'image/png'));
    });
    await check('free-text question about the image is answered by vision', async () => {
        const bot = await menuThen('what colour is the background?');
        assert.ok(texts(bot).includes('a red square'));
    });
    await check('image with an instruction caption runs immediately (no menu)', async () => {
        media.download = async () => PNG;
        const bot = mkBot();
        await chatbot.handle(bot, imgMsg('black and white'), 'black and white', helpers);
        assert.ok(bot.sent.some((s) => s.c.image) && !texts(bot).some((t) => /What do you want me to do/.test(t)));
    });
    await check('cancel clears the menu; unrelated chat falls through to normal reply', async () => {
        media.download = async () => PNG;
        const bot = mkBot();
        await chatbot.handle(bot, imgMsg(), '', helpers);
        await chatbot.handle(bot, mkMsg({ text: 'cancel' }), 'cancel', helpers);
        assert.ok(!pending.get('user@s.whatsapp.net:user@s.whatsapp.net'));
        await chatbot.handle(bot, imgMsg(), '', helpers);
        bot.sent.length = 0;
        await chatbot.handle(bot, mkMsg({ text: 'lol anyway how was your day' }), 'lol anyway how was your day', helpers);
        assert.deepStrictEqual(texts(bot), ['hello from openai/gpt-oss-120b']);
    });
    await check('replying to an image with "make this a sticker" works without a menu', async () => {
        if (!(await hasExif())) return;
        media.download = async () => PNG;
        const bot = mkBot();
        const m = mkMsg({ text: 'make this a sticker', contextInfo: { quotedMessage: { imageMessage: { mimetype: 'image/png' } } } });
        await chatbot.handle(bot, m, 'make this a sticker', helpers);
        assert.ok(bot.sent.some((s) => s.c.sticker));
    });
    await check('group: images are ignored unless the bot is addressed', async () => {
        store.update((d) => { d.modes = ['group']; d.chats = {}; });
        media.download = async () => PNG;
        const bot = mkBot();
        assert.strictEqual(await chatbot.handle(bot, mkMsg({ isGroup: true, type: 'imageMessage', msg: {} }), '', helpers), false);
        const tagged = mkMsg({ isGroup: true, type: 'imageMessage', msg: {}, mentions: ['2349000000000@s.whatsapp.net'] });
        assert.ok(await chatbot.handle(bot, tagged, '', helpers));
        store.update((d) => { d.modes = ['dm']; });
    });

    console.log('chatbot: stickers + videos');
    const stk = async () => sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 200, b: 0, alpha: 1 } } }).webp().toBuffer();
    await check('sticker → menu → image / describe', async () => {
        const buf = await stk();
        media.download = async () => buf;
        const bot = mkBot();
        await chatbot.handle(bot, mkMsg({ type: 'stickerMessage', msg: {} }), '', helpers);
        const t = texts(bot)[0];
        for (const s of ['Convert to image', 'Convert to GIF', 'premium sticker', 'remove background', 'Describe the sticker']) assert.ok(t.includes(s), s);
        bot.sent.length = 0;
        await chatbot.handle(bot, mkMsg({ text: '1' }), '1', helpers);
        const img = bot.sent.find((s) => s.c.image);
        assert.ok(img && (await sharp(img.c.image).metadata()).format === 'png');
        await chatbot.handle(bot, mkMsg({ type: 'stickerMessage', msg: {} }), '', helpers);
        bot.sent.length = 0;
        await chatbot.handle(bot, mkMsg({ text: 'describe' }), 'describe', helpers);
        assert.ok(texts(bot).includes('a red square'));
    });
    await check('sticker → image + remove background', async () => {
        const buf = await stk();
        media.download = async () => buf;
        const bot = mkBot({ REMOVEBG_API: rbgUrl });
        await chatbot.handle(bot, mkMsg({ type: 'stickerMessage', msg: {} }), '', helpers);
        bot.sent.length = 0;
        await chatbot.handle(bot, mkMsg({ text: '4' }), '4', helpers);
        assert.ok(bot.sent.some((s) => s.c.image && s.c.caption === '*BACKGROUND REMOVED VIA CODEX AI*'));
    });
    await check('sticker → GIF (needs ffmpeg)', async () => {
        const buf = await stk();
        media.download = async () => buf;
        const bot = mkBot();
        await chatbot.handle(bot, mkMsg({ type: 'stickerMessage', msg: {} }), '', helpers);
        bot.sent.length = 0;
        await chatbot.handle(bot, mkMsg({ text: 'gif' }), 'gif', helpers);
        const ok = bot.sent.some((s) => s.c.video && s.c.gifPlayback);
        const err = texts(bot).some((t) => /❌/.test(t));
        assert.ok(ok || err, 'either converts or fails politely (ffmpeg may be missing in this sandbox)');
        if (err) console.log('    (ffmpeg unavailable here — failure handled gracefully)');
    });
    await check('video → menu lists all options', async () => {
        media.download = async () => Buffer.from('fakevideo');
        const bot = mkBot();
        await chatbot.handle(bot, mkMsg({ type: 'videoMessage', msg: {} }), '', helpers);
        const t = texts(bot)[0];
        for (const s of ['Convert to sticker', 'premium sticker', 'Extract the audio', 'Transcribe', 'Identify the song']) assert.ok(t.includes(s), s);
    });

    console.log('12 AI commands + helpers');
    await check('.gemini answers, labels it, markdown → WhatsApp formatting', async () => {
        const cmd = require('../commands/ai/gemini.js');
        const out = [];
        const bot = mkBot();
        const m = mkMsg({ text: '.gemini hi' }); m.reply = async (t) => out.push(t);
        await cmd.execute(bot, m, ['say', 'hi']);
        assert.ok(/✦ \*Gemini\*/.test(out[0]) && !/🧠/.test(out[0]), 'unicode header, no brain emoji');
        assert.ok(!/owner note/.test(out[0]), 'normal users never see backup-route notes');
        const fb = calls.filter((c) => c.url === '/g/v1/chat/completions').pop();
        assert.ok(/You are Gemini/.test(fb.body.messages[0].content), 'backup route answers in the command\'s own style');
        const ownerOut = []; const m2 = mkMsg({ sender: 'owner@s.whatsapp.net' }); m2.reply = async (t) => ownerOut.push(t);
        await cmd.execute(mkBot(), m2, ['hi']);
        assert.ok(/owner note/.test(ownerOut[0]), 'owner sees the note');
        assert.ok(!cmd.reactions, 'no custom reaction — the bot-wide cmd-react setting decides');
    });
    await check('.gptoss (Groq-native) answers; usage text when empty', async () => {
        const cmd = require('../commands/ai/gptoss.js');
        const out = [];
        const m = mkMsg({}); m.reply = async (t) => out.push(t);
        await cmd.execute(mkBot(), m, []);
        assert.ok(/Usage/.test(out[0]));
        await cmd.execute(mkBot(), m, ['hello']);
        assert.ok(/hello from openai\/gpt-oss-120b/.test(out[1]) && !/owner note/.test(out[1]));
    });
    await check('missing keys → friendly owner hint', async () => {
        const cmd = require('../commands/ai/claude.js');
        const out = [];
        const m = mkMsg({ sender: 'nokey@s.whatsapp.net' }); m.reply = async (t) => out.push(t);
        const saved = { g: process.env.GROQ_API_KEY, o: process.env.OPENROUTER_API_KEY };
        delete process.env.GROQ_API_KEY; delete process.env.OPENROUTER_API_KEY;
        noBuiltin();
        await cmd.execute(mkBot({ GROQ_API_KEY: '', OPENROUTER_API_KEY: '' }), m, ['hi']);
        restoreBuiltin();
        assert.ok(/GROQ_API_KEY/.test(out[0]) && /aikeys/.test(out[0]));
        await cmd.execute(mkBot({ GROQ_API_KEY: '', OPENROUTER_API_KEY: '' }), m, ['hi']);
        assert.ok(/Claude/.test(out[1]), 'with the built-in keys it works with an empty config');
        noBuiltin();
    });
    await check('toWhatsApp + chunk', () => {
        const { toWhatsApp, chunk } = require('../lib/ai/makeCommand');
        assert.strictEqual(toWhatsApp('## Title\n**bold** and __it__\n- item'), '*Title*\n*bold* and _it_\n• item');
        const big = ('para one.\n\n').repeat(900);
        const parts = chunk(big);
        assert.ok(parts.length > 1 && parts.every((p) => p.length <= 3800));
    });

    console.log('control commands');
    await check('.developers sends BOTH vcards in one message, mine first', async () => {
        const cmd = require('../commands/general/developers.js');
        const bot = mkBot();
        await cmd.execute(bot, mkMsg({}));
        const c = bot.sent[0].c.contacts.contacts;
        assert.strictEqual(c.length, 2);
        assert.ok(c[0].vcard.includes('waid=2349035671349:+2349035671349'));
        assert.ok(c[1].vcard.includes('waid=2348153077566:+2348153077566'));
        assert.ok(/BEGIN:VCARD/.test(c[0].vcard) && /END:VCARD/.test(c[1].vcard));
        assert.ok(cmd.aliases.includes('dev'));
    });
    await check('.chatbot: on/mode/train/default/custom/voice flow + permissions', async () => {
        try { fs.unlinkSync(store.FILE); } catch {}
        store.update((d) => { Object.assign(d, { enabled: false, modes: ['dm', 'tag'], customTrain: null, useDefault: true, voice: 'off', chats: {} }); });
        const cmd = require('../commands/general/chatbot.js');
        const run = async (args, sender = 'owner@s.whatsapp.net', extra = {}) => {
            const out = []; const m = mkMsg({ sender, ...extra }); m.reply = async (t) => out.push(t);
            await cmd.execute(mkBot(), m, args); return out.join('\n');
        };
        assert.ok(/ON/.test(await run(['on']))); assert.strictEqual(store.get().enabled, true);
        assert.ok(/DM \+ TAG|DM/.test(await run(['mode', 'dm']))); assert.deepStrictEqual(store.get().modes, ['dm']);
        await run(['mode', 'group']); assert.deepStrictEqual(store.get().modes, ['group']);
        await run(['mode', 'tag']); assert.deepStrictEqual(store.get().modes, ['tag']);
        await run(['train', 'You', 'are', 'Zara.']);
        assert.deepStrictEqual([store.get().customTrain, store.get().useDefault], ['You are Zara.', false]);
        await run(['default']);
        assert.deepStrictEqual([store.get().customTrain, store.get().useDefault], ['You are Zara.', true]);
        await run(['custom']); assert.strictEqual(store.get().useDefault, false);
        assert.ok(/owner only/i.test(await run(['train', 'hack'], 'rando@s.whatsapp.net')));
        assert.strictEqual(store.get().customTrain, 'You are Zara.');
        assert.ok(/admins only/i.test(await run(['on'], 'rando@s.whatsapp.net', { isGroup: true })));
        await run(['voice', 'auto']); assert.strictEqual(store.get().voice, 'auto');
        assert.ok(/CUSTOM/.test(await run(['status'])));
    });
    await check('.mode dm|group|tag drives the chatbot; public/private untouched', async () => {
        const cmd = require('../commands/owner/mode.js');
        const out = []; const m = mkMsg({}); m.reply = async (t) => out.push(t);
        await cmd.execute(mkBot(), m, ['dm', 'tag']);
        assert.deepStrictEqual(store.get().modes, ['dm', 'tag']);
        await cmd.execute(mkBot(), m, ['group']);
        assert.deepStrictEqual(store.get().modes, ['group']);
        await cmd.execute(mkBot(), m, ['all']);
        assert.deepStrictEqual(store.get().modes.slice().sort(), ['dm', 'group']);
        assert.ok(/ALL/.test(out[out.length - 1]) || /DM \+ GROUP/.test(out[out.length - 1]));
    });

    server.close();
    console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
    fs.rmSync(root, { recursive: true, force: true });
})();
            
