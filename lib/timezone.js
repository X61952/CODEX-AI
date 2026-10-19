// Central timezone for the whole bot.  Set with:   .setvar TIME_ZONE=Africa/Lagos
//
// One value drives everything that cares about the clock:
//   • process.env.TZ — so every local-time Date call (getHours, toLocaleString
//     with no zone, node-cron without an explicit zone, daily resets) follows it
//   • every time shown to users (menu, runtime, warnings, AFK, ModLog, anticall)
//   • every schedule (.sch windows, mute-core recurring cron jobs, anticall
//     schedule) — cron jobs are re-armed the moment the zone changes
// Duration timers (setTimeout/setInterval) are zone-independent by nature, so
// they simply keep working; anything that fires "at a time of day" uses this.
//
// Resolution order at boot: database/variables.json TIME_ZONE -> the
// TIME_ZONE environment variable -> Africa/Lagos.
'use strict';

const fs = require('fs');

const DEFAULT_TZ = 'Africa/Lagos';
let current = null;
const listeners = [];

// Common abbreviations people type instead of an IANA name. Abbreviations are
// ambiguous worldwide, so each maps to the zone it most commonly means.
const ABBREVIATIONS = {
    UTC: 'UTC', GMT: 'UTC', Z: 'UTC', UT: 'UTC',
    WAT: 'Africa/Lagos', CAT: 'Africa/Maputo', EAT: 'Africa/Nairobi', SAST: 'Africa/Johannesburg', WAST: 'Africa/Windhoek',
    CET: 'Europe/Paris', CEST: 'Europe/Paris', EET: 'Europe/Athens', EEST: 'Europe/Athens', WET: 'Europe/Lisbon', BST: 'Europe/London', MSK: 'Europe/Moscow',
    EST: 'America/New_York', EDT: 'America/New_York', CST: 'America/Chicago', CDT: 'America/Chicago',
    MST: 'America/Denver', MDT: 'America/Denver', PST: 'America/Los_Angeles', PDT: 'America/Los_Angeles',
    AKST: 'America/Anchorage', HST: 'Pacific/Honolulu', AST: 'America/Halifax', NST: 'America/St_Johns',
    IST: 'Asia/Kolkata', PKT: 'Asia/Karachi', GST: 'Asia/Dubai', ICT: 'Asia/Bangkok', WIB: 'Asia/Jakarta',
    SGT: 'Asia/Singapore', HKT: 'Asia/Hong_Kong', PHT: 'Asia/Manila', KST: 'Asia/Seoul', JST: 'Asia/Tokyo', CCT: 'Asia/Shanghai',
    AEST: 'Australia/Sydney', AEDT: 'Australia/Sydney', ACST: 'Australia/Adelaide', AWST: 'Australia/Perth', NZST: 'Pacific/Auckland', NZDT: 'Pacific/Auckland',
};

function _try(name) {
    try { return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone; }
    catch { return null; }
}

// Accepts anything a person might type:
//   'africa/lagos', 'America/New York', 'AFRICA/LAGOS'  -> the IANA zone, canonical case
//   'WAT', 'EST', 'IST', 'UTC'                          -> the zone that abbreviation usually means
//   'UTC+1', 'GMT-5', '+01:00'                          -> the matching fixed-offset zone (whole hours)
// Returns the canonical zone name, or null when it is not a real timezone.
function normalize(input) {
    if (input === undefined || input === null) return null;
    const raw = String(input).trim();
    if (!raw) return null;
    const s = raw.replace(/\s+/g, '_');

    // A bare abbreviation wins over Intl's legacy fixed-offset IDs: typing "EST"
    // means New York (with daylight saving), not the fixed UTC-5 zone "EST".
    if (!s.includes('/') && ABBREVIATIONS[raw.toUpperCase()]) return _try(ABBREVIATIONS[raw.toUpperCase()]);

    // Every IANA zone (and its legacy aliases such as Asia/Calcutta, US/Eastern).
    // (Newer Node also accepts raw offsets like "+05:30" as zones; those are NOT
    // valid for process.env.TZ, so they are skipped here and handled below.)
    const direct = /^[+-]/.test(s) ? null : _try(s);
    if (direct) return direct;

    // Fixed offsets: UTC+1, GMT-05, +01:00, UTC+5:30
    const off = raw.replace(/\s+/g, '').match(/^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/i);
    if (off) {
        const hours = Number(off[2]); const mins = Number(off[3] || 0);
        if (mins === 0 && hours <= 14 && !(off[1] === '+' && hours > 14) && !(off[1] === '-' && hours > 12)) {
            if (hours === 0) return 'UTC';
            return _try(`Etc/GMT${off[1] === '+' ? '-' : '+'}${hours}`);   // Etc/GMT signs are inverted
        }
        const half = { '+5:30': 'Asia/Kolkata', '+5:45': 'Asia/Kathmandu', '+3:30': 'Asia/Tehran', '+4:30': 'Asia/Kabul',
                       '+6:30': 'Asia/Yangon', '+9:30': 'Australia/Adelaide', '+8:45': 'Australia/Eucla', '-3:30': 'America/St_Johns',
                       '+10:30': 'Australia/Lord_Howe', '+12:45': 'Pacific/Chatham', '-9:30': 'Pacific/Marquesas' };
        const key = `${off[1]}${hours}:${String(mins).padStart(2, '0')}`;
        return half[key] ? _try(half[key]) : null;
    }

    const abbr = ABBREVIATIONS[raw.toUpperCase()];
    return abbr ? _try(abbr) : null;
}

function _fromDisk() {
    try {
        const v = JSON.parse(fs.readFileSync('./database/variables.json', 'utf8')).TIME_ZONE;
        return normalize(v);
    } catch { return null; }
}

function _apply(tz) {
    current = tz;
    process.env.TZ = tz;   // (TIME_ZONE env is left alone: it is only ever an INPUT, e.g. a panel variable)
}

// Call once, as early as possible at boot.
function init() {
    _apply(_fromDisk() || normalize(process.env.TIME_ZONE) || DEFAULT_TZ);
    return current;
}

function get() {
    return current || init();
}

// Returns the canonical zone, or null (and changes nothing) when invalid.
function set(input) {
    const tz = normalize(input);
    if (!tz) return null;
    const changed = tz !== current;
    _apply(tz);
    if (changed) for (const fn of listeners) { try { fn(tz); } catch {} }
    return tz;
}

function onChange(fn) { listeners.push(fn); }

// "Africa/Lagos (GMT+1)"
function label(tz = get()) {
    try {
        const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
            .formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
        return part ? `${tz} (${part.value})` : tz;
    } catch { return tz; }
}

module.exports = { DEFAULT_TZ, normalize, init, get, set, onChange, label };
