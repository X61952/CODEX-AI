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
// ── Quiet panel ─────────────────────────────────────────────────────────────
// The console shows ONLY:
//   1. the purple "CODEX V3 DEPLOYED ON PTERODACTYL (PANEL)" banner, printed
//      the moment the process starts,
//   2. the "| CODEX V3 | connected" line,
//   3. the normal Baileys/libsignal pre-key and session output (the
//      "Closing open session in favor of incoming prekey bundle" lines and the
//      session chains printed with them),
//   4. errors that stop the bot from starting at all (bad config.json,
//      session lock, boot failure), so a dead bot is never silent.
// Everything else — temp cleaner, health server, connection logs, debug
// output, library chatter — keeps running but prints nothing.
// Set CODEX_DEBUG=1 to turn the filter off and see everything again.
(function _installConsoleFilter() {
    if (process.env.CODEX_DEBUG === '1') return;
    const ANSI = /\u001b\[[0-9;]*m/g;
    const SHOW = [/^CODEX V3 DEPLOYED ON PTERODACTYL/, /^\|\s*CODEX V3\s*\|/i];
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

// Purple banner, immediately at process start (before anything else loads).
console.log('\u001b[35mCODEX V3 DEPLOYED ON PTERODACTYL (PANEL)\u001b[0m');

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
