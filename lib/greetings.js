'use strict';

/**
 * Greetings for the bot owner — GOOD MORNING (7:00 AM), GOOD AFTERNOON (12:00 PM)
 * and GOOD NIGHT (10:00 PM), sent to the owner's number only.
 *
 *  - Follows the bot's central timezone (lib/timezone.js, set with
 *    `.setvar TIME_ZONE=...`) and re-checks it on every tick, so a timezone change
 *    takes effect immediately. `.greetings tz <zone>` can override it for greetings.
 *  - Restart-safe: what was sent today is stored in database/greetings.json, so a
 *    restart never repeats a greeting, and one missed by a few minutes while the bot
 *    was reconnecting is still sent (within a 45 minute grace window).
 *  - Each greeting is a card image (12 designs, 4 per time of day) plus a caption
 *    with the owner's name, the local time and one of 40 lines for that moment.
 *    Designs and lines rotate daily; `.greetings design` can pin or randomise them,
 *    and `.gpreview` shows any of them on demand.
 */

const fs = require('fs');
const path = require('path');
const tz = require('./timezone');

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');
const DB = path.join(PROJECT_ROOT, 'database/greetings.json');

const SLOTS = ['morning', 'afternoon', 'night'];
const TICK_MS = 30_000;
const GRACE_MIN = 45;
const MAX_RETRIES = 5;

const META = {
    morning: { emoji: '☀️', title: 'GOOD MORNING', label: 'Morning' },
    afternoon: { emoji: '🌤️', title: 'GOOD AFTERNOON', label: 'Afternoon' },
    night: { emoji: '🌙', title: 'GOOD NIGHT', label: 'Night' },
};

const LINES = require('./greetingLines');
const DESIGNS = require('./greetingDesigns');

const DEFAULTS = {
    enabled: false,
    card: true,
    name: '',
    tz: '',
    designs: { morning: 'rotate', afternoon: 'rotate', night: 'rotate' },
    times: { morning: '07:00', afternoon: '12:00', night: '22:00' },
    lastSent: {},
};

// ─── Settings ───────────────────────────────────────────────────────────────
function readSettings() {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { /* first run */ }
    return {
        ...DEFAULTS,
        ...raw,
        times: { ...DEFAULTS.times, ...(raw.times || {}) },
        designs: { ...DEFAULTS.designs, ...(raw.designs || {}) },
        lastSent: { ...(raw.lastSent || {}) },
    };
}

function saveSettings(settings) {
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    fs.writeFileSync(DB, JSON.stringify(settings, null, 2));
}

function update(mutator) {
    const settings = readSettings();
    mutator(settings);
    saveSettings(settings);
    return settings;
}

// ─── Time helpers ───────────────────────────────────────────────────────────
/** Zone in use: the greetings override if valid, else the bot's central timezone. */
function currentZone(settings = readSettings()) {
    return (settings.tz && tz.normalize(settings.tz)) || tz.get();
}

function zonedParts(date, zone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', weekday: 'long',
    }).formatToParts(date);
    const get = t => parts.find(p => p.type === t)?.value;
    return {
        year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
        hour: Number(get('hour')) % 24, minute: Number(get('minute')), weekday: get('weekday'),
    };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function dateKey(p) {
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function clock12(hour, minute) {
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

function parseHHMM(text) {
    const m = String(text || '').match(/^(\d{1,2}):(\d{2})$/);
    return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/** "7", "7am", "7:30pm", "19:05", "07:00" → "HH:MM" (or null). */
function parseClock(input) {
    const m = String(input || '').trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
    if (!m) return null;
    let hour = Number(m[1]);
    const minute = Number(m[2] || 0);
    if (m[3]) {
        if (hour < 1 || hour > 12) return null;
        hour = (hour % 12) + (m[3] === 'pm' ? 12 : 0);
    }
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function dayOfYear(p) {
    return Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / 86400000) + 1;
}

function daysInYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function slotLabelTime(settings, slot) {
    const t = parseHHMM(settings.times[slot]);
    return t ? clock12(t.hour, t.minute) : settings.times[slot];
}

// ─── Owner + message ────────────────────────────────────────────────────────
function ownerJid(bot) {
    const owner = bot?.config?.owner;
    const number = String((typeof owner === 'object' ? owner?.number : owner) || '').replace(/[^0-9]/g, '');
    return number ? `${number}@s.whatsapp.net` : null;
}

function pickLine(slot, p, random = false) {
    const count = LINES[slot].length;
    if (random) return Math.floor(Math.random() * count);
    return (dayOfYear(p) * 7 + SLOTS.indexOf(slot) * 13) % count;   // changes every day
}

function pickDesign(slot, settings, p, random = false) {
    const count = DESIGNS[slot].length;
    const pref = settings.designs?.[slot] ?? 'rotate';
    if (random || pref === 'random') return Math.floor(Math.random() * count);
    const n = Number(pref);
    if (Number.isInteger(n) && n >= 1 && n <= count) return n - 1;     // pinned
    return (dayOfYear(p) + SLOTS.indexOf(slot)) % count;                // rotates daily
}

/**
 * opts: { design: 0-based, lineIndex: 0-based, random: true to randomise both, preview: true }
 */
function buildGreeting(slot, settings, when, jid, opts = {}) {
    const meta = META[slot];
    const zone = currentZone(settings);
    const p = zonedParts(when, zone);
    const time = clock12(p.hour, p.minute);
    const date = `${p.weekday}, ${p.day} ${MONTHS[p.month - 1]}`;
    const pct = Math.round((dayOfYear(p) / daysInYear(p.year)) * 100);
    const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
    const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);

    const lineIndex = Number.isInteger(opts.lineIndex) ? opts.lineIndex : pickLine(slot, p, opts.random);
    const design = Number.isInteger(opts.design) ? opts.design : pickDesign(slot, settings, p, opts.random);
    const line = LINES[slot][lineIndex];

    const useName = Boolean(settings.name);
    const tag = useName ? `@${settings.name}` : `@${jid.split('@')[0]}`;
    const rule = '━━━━━━━━━━━━━━━━━━';

    const lines = [
        `${meta.emoji} *${meta.title}* ${tag}`,
        rule,
        `🕒 *${time}*  ·  ${date} ${p.year}`,
        `🌍 ${tz.label(zone)}`,
        '',
        `_${line}_`,
        '',
        `${bar}  ${pct}% of ${p.year} done`,
        rule,
        '_CODEX AI_',
    ];
    if (opts.preview) {
        lines.push('', `🔎 _Preview · design ${design + 1}/${DESIGNS[slot].length} (${DESIGNS[slot][design]}) · line ${lineIndex + 1}/${LINES[slot].length}_`);
    }

    return {
        caption: lines.join('\n'),
        mentions: useName ? [] : [jid],
        card: { name: settings.name || '', time, date, zone: tz.label(zone), design },
        design,
        lineIndex,
    };
}

/**
 * Sends one greeting. By default to the owner's number; `jid` redirects it (used by
 * the preview). Throws when it cannot. Resolves with { design, lineIndex }.
 */
async function sendGreeting(bot, slot, { when = new Date(), jid, design, lineIndex, random = false, preview = false, quoted } = {}) {
    if (!META[slot]) throw new Error(`Unknown greeting "${slot}"`);
    const target = jid || ownerJid(bot);
    if (!target) throw new Error('Owner number is not configured');
    const sock = bot?.sock;
    if (!sock) throw new Error('Bot is not connected');

    const settings = readSettings();
    const mentionJid = ownerJid(bot) || target;
    const built = buildGreeting(slot, settings, when, mentionJid, { design, lineIndex, random, preview });
    const sendOpts = quoted ? { quoted } : undefined;
    const used = { design: built.design, lineIndex: built.lineIndex };

    if (settings.card) {
        try {
            const { renderGreetingCard } = require('./greetingCard');
            const image = renderGreetingCard(slot, built.card);
            await sock.sendMessage(target, { image, mimetype: 'image/jpeg', caption: built.caption, mentions: built.mentions }, sendOpts);
            return used;
        } catch (err) {
            console.warn('[greetings] card failed, sending text:', err.message);
        }
    }
    await sock.sendMessage(target, { text: built.caption, mentions: built.mentions }, sendOpts);
    return used;
}

// ─── Scheduling ─────────────────────────────────────────────────────────────
/** Slots that are due right now and not yet sent today (in the active timezone). */
function dueSlots(settings, now = new Date()) {
    const zone = currentZone(settings);
    const p = zonedParts(now, zone);
    const key = dateKey(p);
    const nowMinutes = p.hour * 60 + p.minute;
    const due = [];
    for (const slot of SLOTS) {
        const t = parseHHMM(settings.times[slot]);
        if (!t) continue;
        const start = t.hour * 60 + t.minute;
        if (nowMinutes >= start && nowMinutes < start + GRACE_MIN && settings.lastSent[slot] !== key) {
            due.push({ slot, key });
        }
    }
    return due;
}

const retries = new Map();
let running = false;

/** One scheduler pass. Returns the slots that were sent. */
async function tick(bot, now = new Date()) {
    if (running) return [];
    running = true;
    const sent = [];
    try {
        const settings = readSettings();
        if (!settings.enabled || !bot?.sock) return sent;

        for (const { slot, key } of dueSlots(settings, now)) {
            const id = `${key}:${slot}`;
            if ((retries.get(id) || 0) >= MAX_RETRIES) continue;

            // Mark first so a slow send can never produce a duplicate.
            update(s => { s.lastSent[slot] = key; });
            try {
                await sendGreeting(bot, slot, { when: now });
                sent.push(slot);
                retries.delete(id);
            } catch (err) {
                retries.set(id, (retries.get(id) || 0) + 1);
                update(s => { if (s.lastSent[slot] === key) delete s.lastSent[slot]; });
                console.warn(`[greetings] ${slot} not sent (${err.message}), will retry`);
            }
        }
    } finally {
        running = false;
    }
    return sent;
}

function stop() {
    if (globalThis.__codexGreetTimer) clearInterval(globalThis.__codexGreetTimer);
    globalThis.__codexGreetTimer = null;
}

/** Starts the scheduler (safe to call many times, and after a reload). */
function init(bot) {
    stop();
    globalThis.__codexGreetBot = bot;
    globalThis.__codexGreetTimer = setInterval(() => tick(bot).catch(() => {}), TICK_MS);
    globalThis.__codexGreetTimer.unref?.();

    // A timezone change takes effect right away instead of at the next tick.
    if (!globalThis.__codexGreetTzHook) {
        globalThis.__codexGreetTzHook = true;
        tz.onChange(() => { const b = globalThis.__codexGreetBot; if (b) tick(b).catch(() => {}); });
    }
    setTimeout(() => tick(bot).catch(() => {}), 5000).unref?.();   // catch-up shortly after boot
}

/** Starts the scheduler only if it is not already running for this bot. */
function ensureRunning(bot) {
    if (!globalThis.__codexGreetTimer || globalThis.__codexGreetBot !== bot) init(bot);
}

module.exports = {
    SLOTS,
    META,
    LINES,
    DESIGNS,
    init,
    stop,
    ensureRunning,
    tick,
    readSettings,
    saveSettings,
    update,
    sendGreeting,
    buildGreeting,
    dueSlots,
    currentZone,
    zonedParts,
    parseClock,
    slotLabelTime,
    ownerJid,
    clock12,
};
        
