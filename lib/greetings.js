'use strict';

/**
 * Group greetings — GOOD MORNING (7:00 AM), GOOD AFTERNOON (12:00 PM),
 * GOOD EVENING (4:00 PM) and GOOD NIGHT (9:00 PM).
 *
 *  - Greetings are sent to GROUPS. Turn them on for a group by sending
 *    `.greetings on` inside that group (owner only). Each group is independent.
 *  - Every greeting is a photo card (assets/greetings/<slot>.jpg) plus a caption
 *    with the group name, the local time and one of 24 lines for that moment.
 *    The line changes every day; `.gpreview` shows any of them on demand
 *    (it works in DM too, and answers in the chat you used it in).
 *  - Follows the bot's central timezone (lib/timezone.js, set with
 *    `.setvar TIME_ZONE=...`) and re-checks it on every tick, so a timezone change
 *    takes effect immediately. `.greetings tz <zone>` can override it for greetings.
 *  - Restart-safe: what each group already received today is stored in
 *    database/greetings.json, so a restart never repeats a greeting, and one missed by
 *    a few minutes while the bot was reconnecting is still sent (45 minute grace window).
 */

const fs = require('fs');
const path = require('path');
const tz = require('./timezone');

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');
const DB = path.join(PROJECT_ROOT, 'database/greetings.json');

const VERSION = 2;
const SLOTS = ['morning', 'afternoon', 'evening', 'night'];
const TICK_MS = 30_000;
const GRACE_MIN = 45;
const MAX_RETRIES = 5;
const GAP_MS = [1800, 3200];            // pause between two groups, keeps WhatsApp happy

const META = {
    morning: {
        emoji: '☀️', deco: '🌅', title: 'GOOD MORNING', label: 'Morning',
        hello: 'Rise and shine,',
        wish: 'Have a blessed and beautiful morning, everyone! 🌤️',
    },
    afternoon: {
        emoji: '🌤️', deco: '🌴', title: 'GOOD AFTERNOON', label: 'Afternoon',
        hello: 'Warm afternoon wishes to the',
        wish: 'Enjoy your afternoon and keep shining, everyone! 🌊',
    },
    evening: {
        emoji: '🌇', deco: '✨', title: 'GOOD EVENING', label: 'Evening',
        hello: 'Golden evening greetings to the',
        wish: 'Have a calm, cosy and lovely evening, everyone! 🧚',
    },
    night: {
        emoji: '🌙', deco: '⭐', title: 'GOOD NIGHT', label: 'Night',
        hello: 'Sweet dreams to the',
        wish: 'Sleep well, dream big and see you tomorrow, everyone! 🌌',
    },
};

const LINES = require('./greetingLines');

const DEFAULTS = {
    version: VERSION,
    card: true,
    tz: '',
    times: { morning: '07:00', afternoon: '12:00', evening: '16:00', night: '21:00' },
    groups: {},
};

// ─── Settings ───────────────────────────────────────────────────────────────
function readSettings() {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { /* first run */ }
    // The old owner-only format (no version) is dropped, only its timezone and card choice are kept.
    if (raw.version !== VERSION) raw = { card: raw.card, tz: raw.tz };
    return {
        ...DEFAULTS,
        ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)),
        version: VERSION,
        times: { ...DEFAULTS.times, ...(raw.times || {}) },
        groups: { ...(raw.groups || {}) },
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

// ─── Message ────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Group names go inside *bold* markers, so strip anything WhatsApp would read as formatting. */
function cleanName(name) {
    return String(name || '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

function pickLine(slot, p, random = false) {
    const count = LINES[slot].length;
    if (random) return Math.floor(Math.random() * count);
    return (dayOfYear(p) * 7 + SLOTS.indexOf(slot) * 5) % count;   // changes every day
}

/**
 * group: { name, members }   opts: { lineIndex: 0-based, random: true, preview: true }
 */
function buildGreeting(slot, settings, when, group = {}, opts = {}) {
    const meta = META[slot];
    const zone = currentZone(settings);
    const p = zonedParts(when, zone);
    const time = clock12(p.hour, p.minute);
    const date = `${p.weekday}, ${p.day} ${MONTHS[p.month - 1]}`;
    const pct = Math.round((dayOfYear(p) / daysInYear(p.year)) * 100);
    const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
    const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);

    const lineIndex = Number.isInteger(opts.lineIndex) ? opts.lineIndex : pickLine(slot, p, opts.random);
    const line = LINES[slot][lineIndex];
    const name = cleanName(group.name) || 'Wonderful';
    const rule = '✦ ━━━━━━━━━━━━━━━━ ✦';
    const thin = '┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈';

    const out = [
        rule,
        `${meta.emoji}  *${meta.title}*  ${meta.deco}`,
        rule,
        '',
        `🌟 ${meta.hello} *${name}* family!`,
        '',
        `❝ _${line}_ ❞`,
        '',
        thin,
        `🕒 *${time}*  ·  ${date} ${p.year}`,
        `🌍 ${tz.label(zone)}`,
    ];
    if (group.members) out.push(`👥 ${group.members} wonderful members`);
    out.push(
        `${bar}  ${pct}% of ${p.year} done`,
        thin,
        `${meta.wish}`,
        '',
        '_CODEX AI_',
    );
    if (opts.preview) {
        out.push('', `🔎 _Preview · line ${lineIndex + 1}/${LINES[slot].length}_`);
    }

    return {
        caption: out.join('\n'),
        card: { name: cleanName(group.name), time, date, zone: tz.label(zone), variant: lineIndex },
        lineIndex,
    };
}

/**
 * Sends one greeting to `jid` (a group, or any chat for a preview).
 * Throws when it cannot. Resolves with { lineIndex }.
 *
 * opts: { when, lineIndex, random, preview, quoted, groupName }
 */
async function sendGreeting(bot, slot, jid, { when = new Date(), lineIndex, random = false, preview = false, quoted, groupName } = {}) {
    if (!META[slot]) throw new Error(`Unknown greeting "${slot}"`);
    if (!jid) throw new Error('No chat to send the greeting to');
    const sock = bot?.sock;
    if (!sock) throw new Error('Bot is not connected');

    const settings = readSettings();
    const isGroup = String(jid).endsWith('@g.us');

    let name = groupName || '';
    let members = 0;
    let participants = [];
    if (isGroup) {
        try {
            const meta = await require('./groupMetaCache').get(bot, jid);
            name = name || meta?.subject || '';
            members = meta?.participants?.length || 0;
            participants = (meta?.participants || []).map(x => x.id || x.jid || x.phoneNumber).filter(Boolean);
        } catch { /* metadata is optional, the greeting still goes out */ }
    }
    if (!isGroup && !name) name = 'Your Group';   // preview in DM

    const built = buildGreeting(slot, settings, when, { name, members }, { lineIndex, random, preview });
    const sendOpts = quoted ? { quoted } : undefined;
    const tag = !preview && isGroup && settings.groups?.[jid]?.tag && participants.length;
    const mentions = tag ? participants : undefined;     // silent tag: everybody is notified, nothing is listed

    if (settings.card) {
        try {
            const { renderGreetingCard } = require('./greetingCard');
            const image = await renderGreetingCard(slot, built.card);
            await sock.sendMessage(jid, { image, mimetype: 'image/jpeg', caption: built.caption, ...(mentions ? { mentions } : {}) }, sendOpts);
            return { lineIndex: built.lineIndex };
        } catch (err) {
            console.warn('[greetings] card failed, sending text:', err.message);
        }
    }
    await sock.sendMessage(jid, { text: built.caption, ...(mentions ? { mentions } : {}) }, sendOpts);
    return { lineIndex: built.lineIndex };
}

// ─── Groups ─────────────────────────────────────────────────────────────────
function isGroupJid(jid) {
    return typeof jid === 'string' && /^[0-9-]+@g\.us$/.test(jid);
}

function enabledGroups(settings = readSettings()) {
    return Object.entries(settings.groups).filter(([, g]) => g && g.enabled).map(([jid]) => jid);
}

/** Slots whose send window is open right now (shared by every group). */
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
        if (nowMinutes >= start && nowMinutes < start + GRACE_MIN) due.push({ slot, key });
    }
    return due;
}

/** Turns greetings on for a group. Slots whose window is open right now are not sent late. */
function enableGroup(jid, now = new Date()) {
    return update(s => {
        const prev = s.groups[jid] || {};
        const lastSent = { ...(prev.lastSent || {}) };
        for (const { slot, key } of dueSlots(s, now)) if (!lastSent[slot]) lastSent[slot] = key;
        s.groups[jid] = { tag: false, ...prev, enabled: true, lastSent, since: prev.since || Date.now() };
    });
}

function disableGroup(jid) {
    return update(s => { if (s.groups[jid]) s.groups[jid].enabled = false; });
}

// ─── Scheduling ─────────────────────────────────────────────────────────────
const retries = new Map();
let running = false;

/** One scheduler pass. Returns [{ slot, jid }] for everything that was sent. */
async function tick(bot, now = new Date()) {
    if (running) return [];
    running = true;
    const sent = [];
    try {
        if (!bot?.sock) return sent;
        const settings = readSettings();
        const groups = enabledGroups(settings);
        if (!groups.length) return sent;

        if (retries.size > 500) retries.clear();

        for (const { slot, key } of dueSlots(settings, now)) {
            for (const jid of groups) {
                const id = `${key}:${slot}:${jid}`;
                if ((retries.get(id) || 0) >= MAX_RETRIES) continue;
                if (readSettings().groups[jid]?.lastSent?.[slot] === key) continue;   // already greeted today
                if (!readSettings().groups[jid]?.enabled) continue;                    // switched off meanwhile

                // Mark first so a slow send can never produce a duplicate.
                update(s => { if (s.groups[jid]) (s.groups[jid].lastSent ||= {})[slot] = key; });
                try {
                    await sendGreeting(bot, slot, jid, { when: now });
                    sent.push({ slot, jid });
                    retries.delete(id);
                } catch (err) {
                    retries.set(id, (retries.get(id) || 0) + 1);
                    update(s => { if (s.groups[jid]?.lastSent?.[slot] === key) delete s.groups[jid].lastSent[slot]; });
                    console.warn(`[greetings] ${slot} not sent to ${jid} (${err.message}), will retry`);
                }
                await sleep(GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0]));
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
    clock12,
    isGroupJid,
    enabledGroups,
    enableGroup,
    disableGroup,
};
