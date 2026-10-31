/**
 * C☯︎DEX-AI — Power control (used by .restart and .shutdown)
 *
 * Both do the same graceful cleanup app.js does on SIGTERM (flush pending
 * credentials, close the socket, release the single-instance lock) and then
 * exit the process. They differ only in the exit code:
 *
 *   restart  → exit code 1  — hosts treat this as "the bot stopped by itself"
 *              and start it again (panel auto-restart, PM2, Docker restart
 *              policy), so the bot comes straight back up.
 *   shutdown → exit code 0  — a clean exit, which panels leave stopped. It
 *              stays off until you press Start on the panel. Under PM2 it also
 *              runs `pm2 stop` so PM2 doesn't bring it back.
 */
const { exec } = require('child_process');

const RESTART_CODE  = 1;
const SHUTDOWN_CODE = 0;

function cleanup(bot) {
    try { require('./connection').flushPendingCredsSave(); } catch {}
    try { if (bot?._healthServer) bot._healthServer.close(); } catch {}
    try { if (bot?.sock) bot.sock.end(); } catch {}
    try { if (bot?._processLockSessionDir) require('./processLock').releaseProcessLock(bot._processLockSessionDir); } catch {}
}

function _exitSoon(bot, code, beforeExit) {
    // Give the "restarting…/shutting down…" message time to reach WhatsApp first.
    setTimeout(() => {
        try { beforeExit?.(); } catch {}
        cleanup(bot);
        setTimeout(() => process.exit(code), 500);
    }, 1500);
}

function restart(bot, opts = {}) {
    // Remember where to say "Restart Complete" once the bot is back online.
    if (opts.chat) { try { require('./restartNotice').mark('restart', opts.chat); } catch {} }
    _exitSoon(bot, RESTART_CODE);
}

function shutdown(bot) {
    _exitSoon(bot, SHUTDOWN_CODE, () => {
        // PM2 would otherwise auto-restart a clean exit; tell it to keep the app stopped.
        if (process.env.pm_id !== undefined) {
            try { exec(`pm2 stop ${process.env.pm_id}`, () => {}); } catch {}
        }
    });
}

module.exports = { restart, shutdown, RESTART_CODE, SHUTDOWN_CODE };
