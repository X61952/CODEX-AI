// Quiet-panel filter in index.js + the start-up update step.
// Run with: node tests/consoleFilter.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const root = path.join(__dirname, '..');

// ── 1. console filter ───────────────────────────────────────────────────────
const src = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const iife = src.slice(src.indexOf('(function _installConsoleFilter()'), src.indexOf('// First lines of the start-up story'));
const out = [];
const fake = {}; for (const m of ['log', 'info', 'warn', 'error', 'debug']) fake[m] = (...a) => out.push(a);
new Function('console', 'process', iife)(fake, { env: {} });
const C = (code, t) => `\u001b[${code}m${t}\u001b[39m`;

const story = [
  'Running in USER MODE', C(34, 'Starting CODEX..'),
  'Update completed successfully', '1. [41d37cdd] :)', '.',
  C(33, '⚠ Session ID changed or missing local creds, fetching from server...'), C(32, '✓ Credentials fetched and cached successfully'),
  C(32, '✓ Session ID unchanged, using local credentials'), C(32, 'Using WA v2.3000.1043857760, isLatest: true'),
  C(93, 'Connecting to WhatsApp...'), C(32, 'Connection established'), C(36, 'Installing Commands/Assets'),
  'Environment variables reloaded', 'Installed 379 commands', C(35, 'Successfully deployed on pterodactyl (panel)'), 'Bot is up to date',
  // login / pairing prompts must stay visible
  '\nNo saved credentials found choose how to login', '1 session id', '\nEnter your phone number starting with 234xxx', 'Your pairing code is ABCD-1234',
  C(31, '❌ config.json has problems that must be fixed before starting:'), 'Boot attempt 1/3 failed:',
];
for (const l of story) fake.log(l);
const chain = { _chains: { k: 'chain-data' } };
fake.info('Closing open session in favor of incoming prekey bundle');
fake.info('Closing session:', chain);
const shown = out.length;
assert.strictEqual(shown, story.length + 2, 'every start-up line and the pre-key output is shown');
assert.strictEqual(out[shown - 1][1], chain, 'session chain is printed with its message');

for (const t of ['Starting codex ai...', 'Loading environment variables..', '(412) cmds loaded', '| CODEX V3 | connected | 6:00 PM',
  'CODEX V3 DEPLOYED ON PTERODACTYL (PANEL)', 'Starting mute timer restoration...', 'Found 0 stored timer(s)', '✓ Restored 0 mute timer(s)',
  '[cleanup] removed 3 files', '[health] listening on port 3000', '[conn 2026] connection open', '[Startup] error: x',
  'Checking WhatsApp version...', '[Baileys] using WhatsApp version 2.3000.1', '[antibug] blocked', 'connection established']) fake.log(t);
fake.warn('library warning'); fake.error('Command error:', new Error('x')); fake.debug('debug'); fake.log({ creds: 1 });
assert.strictEqual(out.length, shown, 'debug / temp cleaner / mute timers / old banner must be silent: ' + out.slice(shown).join(' | '));
console.log('ok - quiet panel filter');

// ── 2. start-up update step ─────────────────────────────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-upd-'));
const VERSION_FILE = path.join(dir, '.version');
const calls = [];
let mode;
const helpers = {
  VERSION_FILE, getCfg: () => ({}),
  applyUpdate: async () => { calls.push('apply'); if (mode === 'throw') throw new Error('network down'); return { ok: true, upToDate: false, commits: [{ hash: '41d37cdd', msg: ':)\nbody line' }], needRestart: false }; },
  checkUpdates: async () => { calls.push('check'); return mode === 'behind' ? { upToDate: false, totalCommits: 3 } : { upToDate: true }; },
};
const updPath = path.join(root, 'commands/owner/update.js');
require.cache[updPath] = { id: updPath, filename: updPath, loaded: true, exports: { _helpers: helpers } };
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (r, ...a) { try { return origResolve.call(this, r, ...a); } catch (e) { if (r === 'chalk') return path.join(root, 'tests', '_stubs', 'chalk.js'); throw e; } };
const { run } = require(path.join(root, 'lib/startupUpdate.js'));
const lines = []; const realLog = console.log; console.log = (...a) => lines.push(a.join(' ').replace(/\u001b\[[0-9;]*m/g, ''));
(async () => {
  try {
    mode = 'ok'; await run({});                               // first deploy: no .version file
    assert.deepStrictEqual(calls, ['apply']);
    assert.deepStrictEqual(lines, ['Update completed successfully', '1. [41d37cdd] :)', '.']);
    fs.writeFileSync(VERSION_FILE, 'abc'); calls.length = 0; lines.length = 0;
    await run({});                                            // restart
    assert.deepStrictEqual(calls, ['check']); assert.deepStrictEqual(lines, ['Bot is up to date', '.']);
    mode = 'behind'; calls.length = 0; lines.length = 0; await run({});
    assert.match(lines[0], /Update available: 3 new commit\(s\)/);
    fs.unlinkSync(VERSION_FILE); mode = 'throw'; lines.length = 0; await run({});
    assert.match(lines[0], /Update check skipped: network down/); assert.strictEqual(lines[1], '.');
    console.log = realLog; console.log('ok - start-up update step');
  } catch (e) { console.log = realLog; console.error(e); process.exit(1); }
})();
