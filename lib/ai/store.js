/**
 * Chatbot settings store → database/aichatbot.json (fresh file; the old
 * chatbotdm / chatbotglobal / chatbotgroup databases are no longer read).
 *
 * {
 *   enabled:     master switch (owner)                       default false
 *   modes:       any of "dm" | "group" | "tag"               default ["dm","tag"]
 *   customTrain: last text set with `.chatbot train`
 *   useDefault:  true  → default training is active (custom kept, just inactive)
 *   voice:       "off" | "on" | "auto"  (auto = answer a voice note with a voice note)
 *   chats:       { "<groupJid>": true|false }   per-group override
 * }
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..', '..');
const FILE = path.join(ROOT, 'database', 'aichatbot.json');
const MODES = ['dm', 'group', 'tag'];

const DEFAULTS = () => ({
    enabled: false,
    modes: ['dm', 'tag'],
    customTrain: null,
    useDefault: true,
    voice: 'off',
    chats: {},
});

let cache = null;

function load() {
    if (cache) return cache;
    let data = {};
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* first run */ }
    cache = { ...DEFAULTS(), ...data };
    if (!Array.isArray(cache.modes) || !cache.modes.length) cache.modes = ['dm', 'tag'];
    cache.modes = cache.modes.filter((m) => MODES.includes(m));
    if (!cache.chats || typeof cache.chats !== 'object') cache.chats = {};
    return cache;
}

function save() {
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        const tmp = FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
        fs.renameSync(tmp, FILE);
    } catch (e) { console.error('[chatbot store]', e.message); }
}

const get = () => load();
function update(fn) { fn(load()); save(); return cache; }

/** Parses "dm", "group tag", "all", "dm+tag" … → array of valid modes or null. */
function parseModes(args) {
    const words = args.join(' ').toLowerCase().split(/[\s,+&/]+/).filter(Boolean);
    if (!words.length) return null;
    const set = new Set();
    for (const w of words) {
        if (w === 'all' || w === 'both') { set.add('dm'); set.add('group'); continue; }
        if (w === 'groups') { set.add('group'); continue; }
        if (w === 'dms' || w === 'pm' || w === 'private') { set.add('dm'); continue; }
        if (MODES.includes(w)) set.add(w); else return null;
    }
    return [...set];
}

/** Is the chatbot allowed to act in this chat at all? (before tag/mode gating) */
function activeFor({ isGroup, chat }) {
    const s = load();
    if (!isGroup) return s.enabled && s.modes.includes('dm');
    const override = s.chats[chat];
    const on = override === true || (s.enabled && override !== false);
    if (!on) return false;
    // groups need a group-type mode (group/tag) unless that group was switched on by hand
    return override === true || s.modes.includes('group') || s.modes.includes('tag');
}

module.exports = { MODES, get, update, parseModes, activeFor, FILE };
