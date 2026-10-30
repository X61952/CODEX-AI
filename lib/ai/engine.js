/**
 * CODEX AI — engine. One tiny OpenAI-compatible client for Groq, OpenRouter and
 * (optionally) OpenAI. No SDKs: only the built-in fetch (Node 22+).
 *
 * Only two keys are used:  GROQ_API_KEY (must start with gsk_)  ·  OPENROUTER_API_KEY
 * Key lookup order (per provider):  bot.config (.setvar)  →  environment variable
 */
const {
    MODELS, GROQ_CHAT, GROQ_VISION, GROQ_WHISPER, OR_VISION, OR_CHAT_FALLBACK,
} = require('./models');

const PROVIDERS = {
    groq:       { base: 'https://api.groq.com/openai/v1',  keyName: 'GROQ_API_KEY' },
    openrouter: { base: 'https://openrouter.ai/api/v1',    keyName: 'OPENROUTER_API_KEY' },
};

const TIMEOUT_MS = 40000;

// ── keys ────────────────────────────────────────────────────────────────────
function getKey(bot, provider) {
    const p = PROVIDERS[provider];
    if (!p) return '';
    const raw = (bot && bot.config && bot.config[p.keyName]) || process.env[p.keyName] || '';
    const key = String(raw).trim();
    if (provider === 'groq' && !key.startsWith('gsk_')) return ''; // Groq keys always start with gsk_
    return key.length >= 10 ? key : '';
}
function keyStatus(bot) {
    return {
        groq: !!getKey(bot, 'groq'),
        openrouter: !!getKey(bot, 'openrouter'),
    };
}
function mask(key) {
    if (!key) return 'NOT SET';
    return key.length < 12 ? '****' : key.slice(0, 4) + '****' + key.slice(-4);
}

// ── tiny rate limiter (per key, sliding window) ─────────────────────────────
const _hits = new Map();
function rateLimited(key, max = 8, windowMs = 60000) {
    if (!key) return false;
    const now = Date.now();
    const arr = (_hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { _hits.set(key, arr); return true; }
    arr.push(now);
    _hits.set(key, arr);
    return false;
}

// ── conversation memory (chatbot) ───────────────────────────────────────────
const MEM_TURNS = 16;
const MEM_TTL_MS = 6 * 60 * 60 * 1000;
const _mem = new Map(); // key -> { turns: [{role, content}], at }

function history(key) {
    const e = _mem.get(key);
    if (!e) return [];
    if (Date.now() - e.at > MEM_TTL_MS) { _mem.delete(key); return []; }
    return e.turns.slice();
}
function remember(key, role, content) {
    if (!key || !content) return;
    const e = _mem.get(key) || { turns: [], at: 0 };
    e.turns.push({ role, content: String(content).slice(0, 1500) });
    while (e.turns.length > MEM_TURNS) e.turns.shift();
    e.at = Date.now();
    _mem.set(key, e);
}
function clearMemory(key) {
    if (!key) return _mem.clear();
    if (key.endsWith('*')) {
        const prefix = key.slice(0, -1);
        for (const k of _mem.keys()) if (k.startsWith(prefix)) _mem.delete(k);
    } else _mem.delete(key);
}
function memoryCount(key) { return history(key).length; }

const _sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _mem) if (now - v.at > MEM_TTL_MS) _mem.delete(k);
    for (const [k, v] of _hits) if (!v.length || now - v[v.length - 1] > 120000) _hits.delete(k);
}, 10 * 60 * 1000);
_sweep.unref?.();

// ── http ────────────────────────────────────────────────────────────────────
async function _fetchJson(provider, path, body, bot, { timeout = TIMEOUT_MS, form = null, method = 'POST' } = {}) {
    const key = getKey(bot, provider);
    if (!key) return { ok: false, status: 0, error: `${PROVIDERS[provider].keyName} is not set` };
    const headers = { Authorization: `Bearer ${key}` };
    if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://codex-ai.site';
        headers['X-Title'] = 'CODEX AI';
    }
    if (!form && method === 'POST') headers['Content-Type'] = 'application/json';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(PROVIDERS[provider].base + path, {
            method,
            headers,
            ...(method === 'POST' ? { body: form || JSON.stringify(body) } : {}),
            signal: ctrl.signal,
        });
        let data = null;
        try { data = await res.json(); } catch { /* non-json */ }
        if (!res.ok) {
            const msg = data?.error?.message || data?.error || `HTTP ${res.status}`;
            return { ok: false, status: res.status, error: String(msg).slice(0, 300) };
        }
        return { ok: true, status: res.status, data };
    } catch (e) {
        return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timed out' : e.message };
    } finally {
        clearTimeout(timer);
    }
}

function _clean(text) {
    if (!text) return '';
    return String(text).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// ── Groq model discovery ────────────────────────────────────────────────────
// Accounts differ in which Groq models they can use, so we ask Groq once (cached)
// and only try models that exist on THIS account. Preference order for text:
const GROQ_TEXT_PREF = [
    'openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile', 'llama-3.1-8b-instant',
];
const GROQ_VISION_PREF = [
    'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b',
    'meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct',
];
let _gm = { ids: null, at: 0 };
async function groqAvailable(bot) {
    if (!getKey(bot, 'groq')) return null;
    if (_gm.ids && Date.now() - _gm.at < 10 * 60 * 1000) return _gm.ids;
    const r = await _fetchJson('groq', '/models', null, bot, { timeout: 15000, method: 'GET' });
    if (!r.ok) return _gm.ids; // keep last known (or null → don't filter)
    _gm = { ids: (r.data?.data || []).map((x) => x.id).filter(Boolean), at: Date.now() };
    return _gm.ids;
}

/** Drops Groq attempts this account can't use and appends usable alternatives. */
async function _fitRoute(bot, route, kind) {
    const avail = await groqAvailable(bot);
    if (!avail || !avail.length) return route;
    const pref = kind === 'vision' ? GROQ_VISION_PREF : GROQ_TEXT_PREF;
    const out = route.filter((a) => a.provider !== 'groq' || avail.includes(a.model));
    const have = new Set(out.filter((a) => a.provider === 'groq').map((a) => a.model));
    const extra = pref.filter((id) => avail.includes(id) && !have.has(id)).map((id) => ({ provider: 'groq', model: id, fallback: true }));
    // usable Groq models go before any non-Groq safety net (e.g. the OpenRouter fallback)
    let at = out.findIndex((a) => a.fallback && a.provider !== 'groq');
    if (at < 0) at = out.length;
    out.splice(at, 0, ...extra);
    return out;
}

// ── routing ─────────────────────────────────────────────────────────────────
/** Builds the ordered list of {provider, model} attempts for one of the 12 commands. */
function routeFor(bot, name) {
    const def = MODELS[name];
    if (!def) return [];
    const override = bot?.config?.[`AI_MODEL_${name.toUpperCase()}`];
    const out = [];
    const orOk = !!getKey(bot, 'openrouter');
    if (def.groq) {
        out.push({ provider: 'groq', model: override || def.groq });
        if (def.or && orOk) out.push({ provider: 'openrouter', model: def.or });
    } else if (orOk) {
        out.push({ provider: 'openrouter', model: override || def.or });
    }
    // Safety net: any Groq model (answers in this command's own style — see chat() fallbackSystem).
    for (const m of GROQ_CHAT) out.push({ provider: 'groq', model: m, fallback: true });
    return out;
}

/** Route for the always-on chatbot: Groq first (as requested), OpenRouter as a safety net. */
function chatbotRoute(bot) {
    const custom = bot?.config?.AI_MODEL_CHATBOT; // .setvar AI_MODEL_CHATBOT=<groq model id>
    const out = [...(custom ? [custom] : []), ...GROQ_CHAT].map((m) => ({ provider: 'groq', model: m }));
    if (getKey(bot, 'openrouter')) out.push({ provider: 'openrouter', model: OR_CHAT_FALLBACK, fallback: true });
    return out;
}

function visionRoute(bot, preferredOr) {
    const out = [];
    const custom = bot?.config?.AI_MODEL_VISION; // .setvar AI_MODEL_VISION=<groq model id>
    if (preferredOr && getKey(bot, 'openrouter')) out.push({ provider: 'openrouter', model: preferredOr });
    if (custom) out.push({ provider: 'groq', model: custom });
    out.push({ provider: 'groq', model: GROQ_VISION });
    if (getKey(bot, 'openrouter')) out.push({ provider: 'openrouter', model: OR_VISION });
    return out;
}

// ── chat ────────────────────────────────────────────────────────────────────
/**
 * chat({ bot, route, system, messages, maxTokens, temperature })
 *   route:    array from routeFor()/chatbotRoute()/visionRoute()
 *   messages: [{role, content}] — content may be a string or OpenAI content-parts array
 * → { ok:true, text, provider, model, degraded } | { ok:false, error }
 */
async function chat({ bot, route, system = '', fallbackSystem = null, messages, maxTokens = 1200, temperature = 0.8, kind = 'text' }) {
    if (!route || !route.length) return { ok: false, error: 'No model route.' };
    const hadKey = route.some((a) => getKey(bot, a.provider));
    route = await _fitRoute(bot, route, kind);
    const mk = (sys) => { const a = []; if (sys) a.push({ role: 'system', content: sys }); a.push(...messages); return a; };

    let lastErr = hadKey
        ? (kind === 'vision' ? 'NO_VISION_MODEL' : 'NO_TEXT_MODEL')
        : 'No API key configured. Owner: set GROQ_API_KEY and/or OPENROUTER_API_KEY.';
    for (const attempt of route) {
        if (!getKey(bot, attempt.provider)) continue;
        const body = { model: attempt.model, messages: mk(attempt.fallback && fallbackSystem ? fallbackSystem : system) };
        body.max_tokens = maxTokens;
        body.temperature = temperature;
        // reasoning models: keep thinking short so the answer isn't cut off
        if (attempt.provider === 'groq' && /gpt-oss/.test(attempt.model)) body.reasoning_effort = 'low';
        if (attempt.provider === 'groq' && /qwen3/.test(attempt.model)) body.reasoning_effort = 'none';
        let r = await _fetchJson(attempt.provider, '/chat/completions', body, bot);
        if (!r.ok && body.reasoning_effort) { delete body.reasoning_effort; r = await _fetchJson(attempt.provider, '/chat/completions', body, bot); }
        if (!r.ok) {
            lastErr = `${attempt.provider}/${attempt.model}: ${r.error}`;
            console.error('[AI]', lastErr);
            continue;
        }
        const text = _clean(r.data?.choices?.[0]?.message?.content);
        if (!text) { lastErr = `${attempt.provider}/${attempt.model}: empty reply`; continue; }
        return { ok: true, text, provider: attempt.provider, model: attempt.model, degraded: !!attempt.fallback };
    }
    return { ok: false, error: lastErr };
}

/** One-shot image question. Returns same shape as chat(). */
async function vision({ bot, imageBase64, mimetype = 'image/jpeg', prompt = 'Describe this image.', system = '', fallbackSystem = null, preferredOr = null, maxTokens = 900 }) {
    if (!imageBase64) return { ok: false, error: 'No image.' };
    return chat({
        bot,
        route: visionRoute(bot, preferredOr),
        system,
        fallbackSystem,
        maxTokens,
        temperature: 0.4,
        kind: 'vision',
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mimetype};base64,${imageBase64}` } },
            ],
        }],
    });
}

// ── speech to text ──────────────────────────────────────────────────────────
async function _transcribeOnce(bot, provider, model, buffer, filename, mimetype) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimetype }), filename);
    form.append('model', model);
    form.append('response_format', 'json');
    return _fetchJson(provider, '/audio/transcriptions', null, bot, { timeout: 60000, form });
}

/** Voice note / audio → text (Groq Whisper). */
async function transcribe({ bot, buffer, mimetype = 'audio/ogg', toMp3 = null }) {
    if (!buffer || !buffer.length) return { ok: false, error: 'Empty audio.' };
    const attempts = [];
    if (getKey(bot, 'groq')) for (const m of GROQ_WHISPER) attempts.push(['groq', m]);
    if (!attempts.length) return { ok: false, error: 'GROQ_API_KEY is not set (needed for voice notes).' };

    let lastErr = '';
    let mp3 = null;
    for (const [provider, model] of attempts) {
        let r = await _transcribeOnce(bot, provider, model, buffer, 'voice.ogg', mimetype);
        if (!r.ok && toMp3) {
            if (!mp3) mp3 = await toMp3(buffer).catch(() => null);
            if (mp3) r = await _transcribeOnce(bot, provider, model, mp3, 'voice.mp3', 'audio/mpeg');
        }
        if (r.ok) {
            const text = String(r.data?.text || '').trim();
            if (text) return { ok: true, text };
            lastErr = 'no speech detected';
        } else lastErr = r.error;
    }
    console.error('[AI] transcribe failed:', lastErr);
    return { ok: false, error: lastErr };
}

/** Key check used by .aikeys test: asks the provider for its model list (no model guessing). */
async function ping(bot, provider) {
    const r = await _fetchJson(provider, '/models', null, bot, { timeout: 20000, method: 'GET' });
    if (!r.ok) return { ok: false, error: r.error };
    const ids = (r.data?.data || []).map((x) => x.id).filter(Boolean);
    return { ok: true, models: ids };
}

module.exports = {
    resetRateLimits: () => _hits.clear(),
    resetModelCache: () => { _gm = { ids: null, at: 0 }; },
    PROVIDERS, getKey, keyStatus, mask, rateLimited,
    history, remember, clearMemory, memoryCount,
    routeFor, chatbotRoute, visionRoute,
    chat, vision, transcribe, ping,
};
