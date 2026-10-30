/**
 * Entry point — safe for hosts that hardcode `node index.js` or `npm start`.
 *
 * Baileys v7+ is ESM-only, so it can't be `require()`d directly from our
 * CommonJS code. We load it ONCE here via the CJS↔ESM bridge
 * (lib/baileys.js → dynamic import), THEN require the actual bot body (app.js).
 * app.js and every module it pulls in destructure Baileys synchronously from the
 * shim, which is fully populated by the time they load.
 *
 * The real application lives in app.js — this file is only the loader.
 */
// ── pm2 look across restarts ─────────────────────────────────────────────────
// If a restart left the bot running outside pm2 on the panel, start it again through
// pm2 (banner + table + "0|CODEX-V3  |" prefix); otherwise make sure the prefix is
// still printed. Under pm2 this does nothing. See lib/pm2Boot.js.
const _pm2Boot = require('./lib/pm2Boot');
if (_pm2Boot.shouldRelaunch()) {
    _pm2Boot.relaunch(__filename);
    return;
}
_pm2Boot.installPrefix();

// ── Quiet panel ─────────────────────────────────────────────────────────────
// The console shows ONLY the start-up story, in this order:
//   Running in USER MODE / Starting CODEX..
//   Update completed successfully + commits (first deploy)  |  Bot is up to date (restart)
//   session lines (✓ Session ID unchanged ... / ⚠ ... fetching from server...)
//   Using WA v…, isLatest: …  →  Connecting to WhatsApp...  →  Connection established
//   Installing Commands/Assets / Environment variables reloaded / Installed N commands
//   Successfully deployed on pterodactyl (panel)
// plus the normal Baileys pre-key / session output, the login + pairing prompts
// (so a first-time pairing can be completed) and errors that stop the bot from
// starting at all. Everything else — temp cleaner, health server, connection
// logs, mute-timer restoration, debug output — keeps running but prints nothing.
// Set CODEX_DEBUG=1 to turn the filter off and see everything again.
(function _installConsoleFilter() {
    if (process.env.CODEX_DEBUG === '1') return;
    const ANSI = /\u001b\[[0-9;]*m/g;
    const SHOW = [
        // start-up story
        /^Running in USER MODE/, /^Starting CODEX\.\./,
        /^Update completed successfully/, /^\d+\. \[[0-9a-f]+\]/, /^Bot is up to date/,
        /^Update available/, /^Update failed/, /^Update check skipped/, /^\.$/,
        /Session ID changed or missing local creds/, /Credentials fetched and cached successfully/,
        /Session ID unchanged, using local credentials/, /^\W*Using local credentials/,
        /^Using WA v/, /^Connecting to WhatsApp\.\.\./, /^Connection established/,
        /^Installing Commands\/Assets/, /^Environment variables reloaded/, /^Installed \d+ commands/,
        /^Successfully deployed on pterodactyl \(panel\)/,
        /^\d+ commands failed to load/i,
        // login / session restore / pairing (lib/connection.js) — the prompts must
        // stay visible or a first-time pairing on the panel can't be completed
        /^No saved credentials found/i, /^1 session id/i, /^2 phone number/i,
        /^Enter your (session id|phone number)/i,
        /Downloading session '/i, /No session files found/i, /Raw server response/i,
        /returned no usable files/i, /Restored \d+ session file/i,
        /Session server didn't respond/i, /Failed to fetch session/i,
        /Session ID saved/i, /Could not save session ID/i,
        /^session id could not be verified/i, /Invalid phone number/i,
        /^Your pairing code is/i, /^Enter it on your phone to link/i,
        /^Pairing code (request )?failed/i,
        /^WhatsApp logged out; clearing/i, /^Could not clear session dir/i,
    ];
    const FATAL = [/^❌/, /^\s+- /, /^Edit config\.json/, /^Boot attempt/, /^Fatal:/];
    const SESSION = /(prekey bundle|closing (open )?session|removing old closed session|opening session|migrating session|session already (open|closed))/i;
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
        const original = console[method].bind(console);
        console[method] = (...args) => {
            try {
                const text = args.map((a) => (typeof a === 'string' ? a : '')).join(' ').replace(ANSI, '').trim();
                if (SESSION.test(text) || SHOW.some((r) => r.test(text)) || FATAL.some((r) => r.test(text))) {
                    return original(...args);
                }
            } catch {}
            // anything else: silent
        };
    }
})();

// First lines of the start-up story (the pm2 banner and table are printed by pm2 itself).
console.log('Running in USER MODE');
console.log('\u001b[34mStarting CODEX..\u001b[0m');

// Centralized temp directory MUST be set up before any library that reads
// TMPDIR/TMP/TEMP at load time (ffmpeg, canvas, Baileys media handling).
require('./utils/tempManager').initializeTempSystem();

// Retry the initial Baileys/app load a few times before giving up — a
// transient failure here (e.g. a slow disk, a momentary module resolution
// hiccup on a panel host) previously killed the process immediately via
// process.exit(1), and depending on the host's restart policy that could
// leave the bot down rather than simply retrying in place.
(async () => {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await require('./lib/baileys').__load();   // populate the Baileys shim first
            require('./app.js');                        // app.js self-starts bot.start()
            return;
        } catch (err) {
            console.error(`Boot attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err?.message || err);
            if (attempt === MAX_ATTEMPTS) {
                console.error('Fatal: failed to load Baileys / boot after retries. The process will stay alive; fix the underlying issue and restart.');
                return;
            }
            await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
    }
})();
