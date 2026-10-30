/**
 * CODEX V3 — keeps the pm2 look ("0|CODEX-V3  |" on the left wall of the panel)
 * alive across restarts.
 *
 * pm2 normally adds that prefix itself (npm start → pm2 start --attach). After a
 * restart the bot can end up running WITHOUT pm2 (the host just runs `node index.js`),
 * and then the prefix — and the pm2 banner/table — disappear. Two safeguards:
 *
 *  1. relaunch():      on a Pterodactyl-style panel, if the bot was started outside pm2,
 *                      start it again THROUGH pm2 (same command as `npm start`), so the
 *                      banner, status table and prefix come back. If pm2 can't start, it
 *                      falls back to a normal boot.
 *  2. installPrefix(): if the bot is still running without pm2, add the same
 *                      "0|CODEX-V3  | " prefix to every console line itself.
 *
 * Under pm2 nothing here does anything (pm2 already prefixes), so there is never a
 * double prefix. CODEX_NO_PM2=1 turns the relaunch off; CODEX_NO_PREFIX=1 turns the prefix off.
 */
'use strict';

const { spawn, spawnSync } = require('child_process');
const util = require('util');

const APP = 'CODEX-V3';
const PREFIX = `0|${APP}  | `;

const underPm2 = (env = process.env) => env.pm_id !== undefined;
const onPanel = (env = process.env) =>
    !!(env.PTERODACTYL || env.PANEL || env.P_SERVER_UUID || env.P_SERVER_MEMORY || env.P_SERVER_PORT);

function shouldRelaunch(env = process.env) {
    return onPanel(env) && !underPm2(env) && env.CODEX_NO_PM2 !== '1' && env.CODEX_PM2_TRIED !== '1';
}

/** Adds the pm2-style prefix to console output when pm2 is not doing it. */
function installPrefix(env = process.env, con = console) {
    if (underPm2(env) || env.CODEX_NO_PREFIX === '1') return false;
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
        const original = con[method].bind(con);
        con[method] = (...args) => {
            let text;
            try { text = util.format(...args); } catch { text = String(args[0]); }
            original(text.split('\n').map((line) => PREFIX + line).join('\n'));
        };
    }
    return true;
}

/** Starts the bot again through pm2 and mirrors its exit. Falls back to a plain boot. */
function relaunch(entry, { npx = process.platform === 'win32' ? 'npx.cmd' : 'npx', env = process.env } = {}) {
    const childEnv = { ...env, FORCE_COLOR: '1', CODEX_PM2_TRIED: '1' };
    const started = Date.now();
    let fellBack = false;

    const plainBoot = () => {
        if (fellBack) return;
        fellBack = true;
        const plain = spawn(process.execPath, [entry], { stdio: 'inherit', env: { ...env, CODEX_NO_PM2: '1' } });
        plain.on('exit', (code) => process.exit(code ?? 0));
        for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { plain.kill(sig); } catch { /* gone */ } });
    };

    // an old CODEX-V3 left over from before the restart would clash with the new one
    try { spawnSync(npx, ['-y', 'pm2', 'delete', APP], { stdio: 'ignore', env: childEnv, timeout: 60000 }); } catch { /* none */ }

    let child;
    try {
        child = spawn(npx, ['-y', 'pm2', 'start', entry, '--attach', '--name', APP, '--', '--color'], { stdio: 'inherit', env: childEnv });
    } catch { return plainBoot(); }

    child.on('error', plainBoot);
    child.on('exit', (code, signal) => {
        // pm2 itself failed right away (no network, no npx …) → boot normally instead
        if (code !== 0 && !signal && Date.now() - started < 20000) return plainBoot();
        process.exit(code ?? 0);
    });
    for (const sig of ['SIGINT', 'SIGTERM']) {
        process.on(sig, () => {
            try { child.kill(sig); } catch { /* gone */ }
            setTimeout(() => process.exit(0), 3000).unref?.();
        });
    }
}

module.exports = { APP, PREFIX, underPm2, onPanel, shouldRelaunch, installPrefix, relaunch };
                       
