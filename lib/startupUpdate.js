// Start-up update step (runs once per boot, before commands load):
//   • FIRST deploy (no .version file yet)  -> applies the latest update from the
//     configured repo and prints "Update completed successfully" plus the
//     commits it applied, e.g.  "1. [41d37cdd] message"
//   • every later start (restart)          -> checks only and prints
//     "Bot is up to date"  (or says an update is waiting; apply it with
//     ".update now")
// Uses the same repo settings as the .update command (UPDATE_REPO,
// UPDATE_BRANCH, UPDATE_TOKEN ...). It never throws: a network problem just
// prints a short yellow line and the bot carries on starting.
'use strict';

const fs = require('fs');
const chalk = require('chalk');

const firstLine = (msg) => String(msg || '').split('\n')[0].trim();

async function run(config = {}) {
    try {
        const upd = require('../commands/owner/update.js')._helpers;
        const cfg = upd.getCfg({ config });
        const firstDeploy = !fs.existsSync(upd.VERSION_FILE);

        const work = (async () => {
            if (firstDeploy) {
                const r = await upd.applyUpdate(cfg);
                if (r.upToDate) return console.log('Bot is up to date');
                if (!r.ok) return console.log(chalk.red(`Update failed (${r.failed.length} file(s)) — use .update now to retry`));
                console.log('Update completed successfully');
                (r.commits || []).slice(0, 10).forEach((c, i) => console.log(`${i + 1}. [${c.hash}] ${firstLine(c.msg)}`));
                // Core files changed: under pm2 a clean exit restarts the bot on the new code.
                if (r.needRestart && process.env.pm_id !== undefined) {
                    console.log('.');
                    process.exit(0);
                }
                return;
            }
            const r = await upd.checkUpdates(cfg);
            if (r.upToDate) return console.log('Bot is up to date');
            console.log(chalk.yellow(`Update available: ${r.totalCommits} new commit(s) — send .update now`));
        })();
        await Promise.race([work, new Promise((resolve) => { const t = setTimeout(resolve, 45000); t.unref?.(); })]);
    } catch (e) {
        console.log(chalk.yellow(`Update check skipped: ${e.message}`));
    }
    console.log('.');
}

module.exports = { run };
