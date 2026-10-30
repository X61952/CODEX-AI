// pm2 look across restarts: prefix + relaunch through pm2 (with a fake npx, no real pm2 needed).
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const boot = require('../lib/pm2Boot');

let passed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`  ok - ${label}`); } catch (e) { console.error(`  FAIL - ${label}\n    ${e.stack}`); process.exitCode = 1; } };

check('shouldRelaunch only on a panel, outside pm2, without opt-outs', () => {
    assert.strictEqual(boot.shouldRelaunch({ P_SERVER_UUID: 'x' }), true);
    assert.strictEqual(boot.shouldRelaunch({}), false, 'not a panel (VPS/Render/dev)');
    assert.strictEqual(boot.shouldRelaunch({ P_SERVER_UUID: 'x', pm_id: '0' }), false, 'already under pm2');
    assert.strictEqual(boot.shouldRelaunch({ P_SERVER_UUID: 'x', CODEX_NO_PM2: '1' }), false);
    assert.strictEqual(boot.shouldRelaunch({ P_SERVER_UUID: 'x', CODEX_PM2_TRIED: '1' }), false, 'never loops');
});

check('installPrefix prefixes every line, keeps multi-line + blank lines', () => {
    const out = [];
    const con = {}; for (const m of ['log', 'info', 'warn', 'error', 'debug']) con[m] = (t) => out.push(t);
    assert.strictEqual(boot.installPrefix({}, con), true);
    con.log('hello %s', 'world');
    con.error('a\nb');
    con.info('');
    assert.deepStrictEqual(out, ['0|CODEX-V3  | hello world', '0|CODEX-V3  | a\n0|CODEX-V3  | b', '0|CODEX-V3  | ']);
});

check('installPrefix does nothing under pm2 (pm2 prefixes itself — no double prefix)', () => {
    const out = []; const con = {}; for (const m of ['log', 'info', 'warn', 'error', 'debug']) con[m] = (t) => out.push(t);
    assert.strictEqual(boot.installPrefix({ pm_id: '0' }, con), false);
    con.log('x'); assert.deepStrictEqual(out, ['x']);
    assert.strictEqual(boot.installPrefix({ CODEX_NO_PREFIX: '1' }, con), false);
});

// ── end to end with a fake npx ──────────────────────────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-pm2-'));
const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
const writeNpx = (startExit) => {
    fs.writeFileSync(path.join(bin, 'npx'), `#!/bin/sh\ncase "$*" in\n  *delete*) echo "PM2 DELETE" >> "${dir}/calls.log"; exit 0;;\n  *start*) echo "PM2 STARTED $*" ; echo "PM2 START" >> "${dir}/calls.log"; exit ${startExit};;\nesac\n`, { mode: 0o755 });
};
const entry = path.join(dir, 'index.js');
fs.writeFileSync(entry, `
const boot = require(${JSON.stringify(path.join(__dirname, '..', 'lib', 'pm2Boot.js'))});
if (boot.shouldRelaunch()) { boot.relaunch(__filename); return; }
boot.installPrefix();
console.log('BOT RUNNING');
`);
const run = (env) => spawnSync(process.execPath, [entry], { env: { PATH: `${bin}:${process.env.PATH}`, ...env }, encoding: 'utf8', timeout: 30000 });

check('panel + started outside pm2 → relaunched THROUGH pm2 (old app deleted first)', () => {
    writeNpx(0); fs.rmSync(path.join(dir, 'calls.log'), { force: true });
    const r = run({ P_SERVER_UUID: 'abc' });
    assert.ok(/PM2 STARTED .*start .*index\.js --attach --name CODEX-V3 -- --color/.test(r.stdout), r.stdout);
    assert.ok(!/BOT RUNNING/.test(r.stdout), 'the bot body does not also run here');
    assert.deepStrictEqual(fs.readFileSync(path.join(dir, 'calls.log'), 'utf8').trim().split('\n'), ['PM2 DELETE', 'PM2 START']);
});

check('pm2 cannot start → falls back to a normal boot, still with the prefix', () => {
    writeNpx(1);
    const r = run({ P_SERVER_UUID: 'abc' });
    assert.ok(/0\|CODEX-V3  \| BOT RUNNING/.test(r.stdout), r.stdout + r.stderr);
});

check('already under pm2 → normal boot, no extra prefix', () => {
    const r = run({ P_SERVER_UUID: 'abc', pm_id: '0' });
    assert.strictEqual(r.stdout.trim(), 'BOT RUNNING');
});

check('not a panel (VPS / dev) → untouched flow, prefix still kept', () => {
    const r = run({});
    assert.ok(/^0\|CODEX-V3  \| BOT RUNNING/.test(r.stdout.trim()), r.stdout);
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
  
