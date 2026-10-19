/**
 * C☯︎DEX-AI — Permit engine
 *
 * Lets the owner/mod open specific commands (or a whole category such as
 * "economy") to EVERYONE, even people who are not owner / mod / sudo.
 * Permits are GLOBAL — one switch covers every group and DM the bot is in.
 *
 * What a permit does
 *   In PRIVATE mode the bot ignores anyone who isn't owner/mod/sudo
 *   (see the MODE CHECK in lib/messageHandler.js). A permitted command is let
 *   through that gate for everybody. Nothing else changes: per-command flags
 *   (groupOnly etc.) still apply as normal.
 *
 * What a permit can NEVER do
 *   Owner / admin commands are never permittable — see restrictionReason().
 *   Checked when a permit is created AND every time it is used, so a command
 *   that is later flagged (or a new one added) stays protected.
 *
 * Targets
 *   cmd:<name>   one command (aliases resolve to the primary name)
 *   cat:<name>   a whole category, resolved live — so commands added to that
 *                category later are covered automatically.
 *
 * Timing is built on the existing timer engine (lib/mute-core.js):
 *   .permit ping 2h             → active now, ends after 2h
 *   .permit ping after 2h       → starts in 2h
 *   .permit ping after 2h for 1h→ starts in 2h, ends 1h later
 *   .sch -permit ping 6pm to 9pm daily
 * State is always computed from timestamps / the clock, so it is exact; the
 * timer jobs only announce the start/end and tidy up expired entries.
 */

const fs   = require('fs-extra');
const path = require('path');

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');
const DB = path.join(PROJECT_ROOT, 'database/permit.json');

const RECURRING_TYPE = 'sch-permit';   // daily windows, stored in recurringSchedules.json
const TIMER_CHAT     = 'permit';       // pseudo chat key for one-time timer jobs / windows
const tz             = require('./timezone'); // bot timezone — same zone as .sch

// Commands living in these folders can never be permitted.
const RESTRICTED_CMD_CATEGORIES = new Set(['owner', 'admin', 'bot']);
// Whole categories that can never be permitted with `.permit <category>`.
const RESTRICTED_CATEGORIES = new Set(['owner', 'admin', 'bot', 'group']);
// Belt-and-braces: never permittable, whatever their flags say.
const NEVER_PERMIT = new Set([
    'addcoins', 'givecoins', 'removecoins', 'setcoins', 'setlevel', 'reseteconomy',
    'eval', '$', 'shell', 'exec', 'permit',
]);
// A command whose own code checks owner/mod/sudo/admin is an owner/admin command.
const PERMISSION_PATTERN = /\b_?is(?:Owner|Mod|Sudo|Admin|BotAdmin)\b/;

// ── storage ──────────────────────────────────────────────────────────────────
let _snap = null, _snapAt = 0;
let _win = null,  _winAt = 0;

function load() {
    let d = {};
    try { d = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch {}
    if (!d || typeof d !== 'object') d = {};
    if (typeof d.enabled !== 'boolean') d.enabled = true;
    if (!d.grants || typeof d.grants !== 'object') d.grants = {};
    return d;
}

function save(d) {
    fs.ensureDirSync(path.dirname(DB));
    fs.writeFileSync(DB, JSON.stringify(d, null, 2));
    _snap = d; _snapAt = Date.now();
}

// Hot path (runs for every command from a non-privileged sender): short cache.
function snapshot() {
    if (_snap && Date.now() - _snapAt < 2000) return _snap;
    _snap = load(); _snapAt = Date.now();
    return _snap;
}

function windows() {
    if (_win && Date.now() - _winAt < 5000) return _win;
    try { _win = require('./mute-core').listRecurringByType(RECURRING_TYPE); }
    catch { _win = []; }
    _winAt = Date.now();
    return _win;
}

/** Drop caches (call after touching the recurring DB from outside). */
function touch() { _snap = null; _win = null; }

// ── time helpers ─────────────────────────────────────────────────────────────
function lagosMinutes(now = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz.get(), hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(now));
    const h = parseInt(parts.find(p => p.type === 'hour').value, 10) % 24;
    const mi = parseInt(parts.find(p => p.type === 'minute').value, 10);
    return h * 60 + mi;
}

function inWindow(rec, now = Date.now()) {
    const from = rec.timeFrom.hour * 60 + rec.timeFrom.minute;
    const to   = rec.timeTo.hour * 60 + rec.timeTo.minute;
    if (from === to) return false;
    const cur = lagosMinutes(now);
    return from < to ? (cur >= from && cur < to) : (cur >= from || cur < to); // handles 10pm → 2am
}

const hhmm = t => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;

function activeGrant(g, now) {
    return !!g && (!g.startsAt || now >= g.startsAt) && (!g.expiresAt || now < g.expiresAt);
}

// ── restrictions ─────────────────────────────────────────────────────────────
/** Returns a short reason string if `command` may never be permitted, else null. */
function restrictionReason(command) {
    if (!command) return 'unknown command';
    const name = String(command.name || '').toLowerCase();
    const cat  = String(command.category || '').toLowerCase();

    if (NEVER_PERMIT.has(name))          return 'sensitive command';
    if (command.ownerOnly)               return 'owner-only command';
    if (command.sudoOnly)                return 'sudo-only command';
    if (command.adminOnly)               return 'admin-only command';
    if (command.owner === true || command.modOnly === true) return 'owner-only command';

    const perm = String(command.permission || '').toLowerCase();
    if (['owner', 'admin', 'sudo', 'mod'].includes(perm)) return `${perm}-only command`;

    if (cat === 'owner') return 'owner command';
    if (cat === 'admin') return 'admin command';
    if (RESTRICTED_CMD_CATEGORIES.has(cat)) return 'bot-management command';

    const meta = `${command.description || ''} ${command.desc || ''}`;
    if (/\[(owner|admin|mod|sudo)\]|\b(owner|admin|sudo|mod)s?[- ]only\b/i.test(meta)) return 'owner/admin command';

    try {
        const fn = command.__origExecute || command.execute;
        if (fn && PERMISSION_PATTERN.test(Function.prototype.toString.call(fn))) {
            return 'it checks owner/admin rights itself';
        }
    } catch {}
    return null;
}

// ── target resolution ────────────────────────────────────────────────────────
/**
 * Some categories are two words on disk (commands/visual games/,
 * commands/media editor/), so ".permit visual games" has to be read as ONE
 * target, not a target ("visual") plus a bogus duration ("games"). This
 * greedily matches the longest real category name at the front of `words`
 * and returns how many words it ate; a plain command name always eats one.
 */
function splitLeadingTarget(bot, words) {
    const cats = categoriesOf(bot);
    const maxWords = Math.max(1, ...[...cats].map(c => c.split(' ').length));
    for (let n = Math.min(maxWords, words.length); n >= 2; n--) {
        const cand = words.slice(0, n).join(' ').toLowerCase();
        if (cats.has(cand)) return { text: words.slice(0, n).join(' '), rest: words.slice(n) };
    }
    return { text: words[0] || '', rest: words.slice(1) };
}

function categoriesOf(bot) {
    const set = new Set();
    for (const c of bot.commands.values()) {
        const cat = String(c.category || '').toLowerCase();
        if (cat) set.add(cat);
    }
    return set;
}


/**
 * Turn user text ("ping", ".ping", "economy") into a permit target.
 * → { ok:true, type, name, key, label } | { ok:false, error }
 */
function resolveTarget(bot, raw) {
    let name = String(raw || '').trim().toLowerCase();
    const prefix = String(bot.prefix || '').toLowerCase();
    if (prefix && prefix !== 'null' && name.startsWith(prefix)) name = name.slice(prefix.length);
    if (!name) return { ok: false, error: 'Tell me which command (or category) — e.g. ping or economy.' };

    const cmd   = bot.commandHandler.getCommand(name);
    const isCat = categoriesOf(bot).has(name);

    // A restricted category name (owner/admin/bot/group) always means the
    // CATEGORY, even if a command happens to share that name/alias (e.g. the
    // general command ".owner", or ".admin" as an alias of .promote) — so
    // typing .permit owner / .permit admin can never sneak past the block.
    if (isCat && RESTRICTED_CATEGORIES.has(name)) {
        const never = name === 'owner' || name === 'admin';
        return { ok: false, error: never
            ? `The *${name}* category can't be permitted — owner/admin commands are never permittable.`
            : `The *${name}* category can't be permitted as a whole (it holds management commands). You can still permit individual safe commands from it.` };
    }

    if (isCat && (name === 'economy' || !cmd)) {
        return { ok: true, type: 'cat', name, key: `cat:${name}`, label: `all ${name} commands` };
    }

    if (cmd) {
        const why = restrictionReason(cmd);
        if (why) return { ok: false, error: `*${bot.prefix || ''}${cmd.name}* can't be permitted (${why}).` };
        const n = String(cmd.name).toLowerCase();
        return { ok: true, type: 'cmd', name: n, key: `cmd:${n}`, label: `${bot.prefix || ''}${n}` };
    }

    return { ok: false, error: `No command or category called *${name}*.` };
}

/** Human label for a stored key ("cmd:ping" → ".ping"). */
function describeKey(bot, key) {
    const [type, ...rest] = String(key).split(':');
    const name = rest.join(':');
    return type === 'cat' ? `${name} (category)` : `${bot?.prefix || '.'}${name}`;
}

// ── permission check (used by messageHandler) ────────────────────────────────
function isCommandPermitted(bot, command) {
    if (!command) return false;
    const d = snapshot();
    if (!d.enabled) return false;

    const now  = Date.now();
    const name = String(command.name || '').toLowerCase();
    const cat  = String(command.category || '').toLowerCase();

    // A category permit never reaches a restricted category (owner/admin/bot/group).
    const catOk = !!cat && !RESTRICTED_CATEGORIES.has(cat);

    let covered = activeGrant(d.grants[`cmd:${name}`], now)
        || (catOk && activeGrant(d.grants[`cat:${cat}`], now));
    if (!covered) {
        covered = windows().some(r =>
            (r.target === `cmd:${name}` || (catOk && r.target === `cat:${cat}`)) && inWindow(r, now));
    }
    if (!covered) return false;

    return !restrictionReason(command); // owner/admin commands are never let through
}

/** Mirrors the dispatch rules in messageHandler to find which command a message would run. */
function commandFromText(bot, text) {
    const raw = String(text || '');
    const t = raw.trim();
    if (!t) return null;
    const first = (t.split(/ +/)[0] || '').toLowerCase();
    const getCommand = n => bot.commandHandler.getCommand(n);

    const np = first ? getCommand(first) : null;
    if (np && np.noPrefix === true) return np;               // bare-word command

    const rawPrefix = bot.config?.prefix ?? bot.prefix ?? '.';
    const noPrefixMode = !rawPrefix || String(rawPrefix).toLowerCase() === 'null';
    if (noPrefixMode) return np || null;

    if (!raw.startsWith(bot.prefix)) return null;
    const name = raw.slice(bot.prefix.length).trim().split(/ +/)[0]?.toLowerCase();
    const cmd = name ? getCommand(name) : null;
    return cmd && cmd.noPrefix !== true ? cmd : null;
}

function isTextPermitted(bot, text) {
    try { return isCommandPermitted(bot, commandFromText(bot, text)); }
    catch { return false; }
}

// ── timers (built on lib/mute-core.js) ───────────────────────────────────────
function cancelTimers(key) {
    const mc = require('./mute-core');
    mc.cancel({ type: 'permitStart', chat: TIMER_CHAT, target: key });
    mc.cancel({ type: 'permitEnd',   chat: TIMER_CHAT, target: key });
}

function armTimers(key, { startsAt, expiresAt }, notifyChat, by) {
    const mc = require('./mute-core');
    cancelTimers(key);
    const extra = { notifyChat };
    if (startsAt)  mc.schedule({ type: 'permitStart', chat: TIMER_CHAT, target: key, expiresAt: startsAt,  mutedBy: by, extra });
    if (expiresAt) mc.schedule({ type: 'permitEnd',   chat: TIMER_CHAT, target: key, expiresAt: expiresAt, mutedBy: by, extra });
}

/** Called by mute-core when a permitStart / permitEnd job comes due. */
async function onTimerJob(bot, job) {
    const key = job.target;
    const chat = job.notifyChat;
    const label = describeKey(bot, key);
    let text = null;

    if (job.type === 'permitStart') {
        text = `🔓 *Permit active:* ${label} is now open to everyone.`;
    } else if (job.type === 'permitEnd') {
        const d = load();
        const g = d.grants[key];
        if (g && g.expiresAt && g.expiresAt <= Date.now()) {
            delete d.grants[key];
            save(d);
        }
        text = `🔒 *Permit ended:* ${label} is back to normal.`;
    }
    if (text && chat) await bot.sendMessage(chat, { text }).catch(() => {});
}

// ── mutations ────────────────────────────────────────────────────────────────
/** window: { startsAt|null, expiresAt|null } (absolute ms timestamps) */
function grant(target, window, { by = null, notifyChat = null } = {}) {
    const d = load();
    d.grants[target.key] = {
        type: target.type, name: target.name,
        startsAt: window.startsAt || null,
        expiresAt: window.expiresAt || null,
        by, at: Date.now(),
    };
    save(d);
    try { armTimers(target.key, window, notifyChat, by); } catch (e) { console.error('[permit] timer failed:', e.message); }
    return d.enabled;
}

/** Removes grant + timers + daily windows for a key. Returns what existed. */
function revoke(key) {
    const d = load();
    const hadGrant = !!d.grants[key];
    delete d.grants[key];
    save(d);
    try { cancelTimers(key); } catch {}
    let windowsRemoved = 0;
    try { windowsRemoved = require('./mute-core').cancelRecurringByType(RECURRING_TYPE, key); } catch {}
    touch();
    return { hadGrant, windowsRemoved };
}

function setEnabled(on) {
    const d = load();
    const changed = d.enabled !== !!on;
    d.enabled = !!on;
    save(d);
    return changed;
}

function isEnabled() { return load().enabled; }

/** Keys of every stored grant (used to remove permits for commands that no longer exist). */
function storedKeys() { return Object.keys(load().grants); }

/** Removes every permit, pending timer and daily window. */
function clearAll() {
    const d = load();
    const grants = Object.keys(d.grants).length;
    d.grants = {};
    save(d);
    try { require('./mute-core').cancelAll({ chat: TIMER_CHAT }); } catch {}
    let wins = 0;
    try { wins = require('./mute-core').cancelRecurringByType(RECURRING_TYPE); } catch {}
    touch();
    return { grants, windows: wins };
}

function addWindow({ target, by, timeFrom, timeTo }) {
    const id = require('./mute-core').addRecurring({
        chat: TIMER_CHAT, target: target.key, mutedBy: by, type: RECURRING_TYPE, timeFrom, timeTo,
    });
    touch();
    return id;
}

// ── list rendering ───────────────────────────────────────────────────────────
function countCategory(bot, cat) {
    let ok = 0, locked = 0;
    const seen = new Set();
    for (const c of bot.commands.values()) {
        if (seen.has(c)) continue;
        seen.add(c);
        if (String(c.category || '').toLowerCase() !== cat) continue;
        restrictionReason(c) ? locked++ : ok++;
    }
    return { ok, locked };
}

function renderList(bot) {
    const { humanize } = require('./mute-core');
    const P = bot.prefix || '.';
    const d = load();
    const now = Date.now();
    const lines = [];

    const grants = Object.entries(d.grants).filter(([, g]) => !g.expiresAt || g.expiresAt > now);
    const wins = windows();

    const fmtWhen = g => {
        if (g.startsAt && g.startsAt > now) {
            return `starts in ${humanize(g.startsAt - now)}` + (g.expiresAt ? `, lasts ${humanize(g.expiresAt - g.startsAt)}` : ', until removed');
        }
        return g.expiresAt ? `${humanize(g.expiresAt - now)} left` : 'until removed';
    };

    const cmds = grants.filter(([k]) => k.startsWith('cmd:'));
    const cats = grants.filter(([k]) => k.startsWith('cat:'));

    if (cmds.length) {
        lines.push('*Commands*');
        for (const [k, g] of cmds) lines.push(`• ${P}${k.slice(4)} — ${fmtWhen(g)}`);
    }
    if (cats.length) {
        if (lines.length) lines.push('');
        lines.push('*Categories*');
        for (const [k, g] of cats) {
            const name = k.slice(4);
            const c = countCategory(bot, name);
            lines.push(`• ${name} — ${fmtWhen(g)} (${c.ok} cmds${c.locked ? `, ${c.locked} owner/admin stay locked` : ''})`);
        }
    }
    if (wins.length) {
        if (lines.length) lines.push('');
        lines.push('*Daily schedules* _(Nigeria time)_');
        for (const r of wins) {
            const live = inWindow(r, now) ? ' 🟢 active now' : '';
            lines.push(`• ${describeKey(bot, r.target).replace(' (category)', ' (all)')} — ${hhmm(r.timeFrom)} → ${hhmm(r.timeTo)}${live}`);
        }
    }

    const head = `🔓 *PERMIT LIST*\nSystem: ${d.enabled ? '*ON* ✅' : '*OFF* ❌'}  •  Bot mode: *${String(bot.config?.mode || 'public').toUpperCase()}*`;
    if (!lines.length) return `${head}\n\nNo permits set.\nTry: ${P}permit ping`;
    return `${head}\n\n${lines.join('\n')}`;
}

module.exports = {
    RECURRING_TYPE, TIMER_CHAT,
    restrictionReason, resolveTarget, splitLeadingTarget, describeKey,
    isCommandPermitted, isTextPermitted, commandFromText,
    grant, revoke, setEnabled, isEnabled, storedKeys, clearAll, addWindow,
    onTimerJob, renderList, countCategory, hhmm, touch,
};

