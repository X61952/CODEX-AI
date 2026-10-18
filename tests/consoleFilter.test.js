// Quiet-panel filter in index.js: purple banner, "| CODEX V3 |" line and
// Baileys pre-key/session output get through; everything else is silent.
// Run with: node tests/consoleFilter.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
const iife = src.slice(src.indexOf('(function _installConsoleFilter()'), src.indexOf('// Centralized temp directory'));
const out = [];
const fake = {}; for (const m of ['log', 'info', 'warn', 'error', 'debug']) fake[m] = (...a) => out.push(a);
new Function('console', 'process', iife)(fake, { env: {} });

assert.ok(iife.includes("[35mCODEX V3 DEPLOYED ON PTERODACTYL (PANEL)"), 'banner is purple + capitals');
fake.log('\u001b[35mCODEX V3 DEPLOYED ON PTERODACTYL (PANEL)\u001b[0m');
fake.log('\u001b[32m| CODEX V3 | connected | 6:00 PM\u001b[39m');
const chain = { _chains: { k: 'chain-data' } };
fake.info('Closing open session in favor of incoming prekey bundle');
fake.info('Closing session:', chain);
fake.warn('Removing old closed session:', chain);
fake.log('\u274c config.json has problems that must be fixed before starting:');
fake.error('Boot attempt 1/3 failed:', 'boom');
const shown = out.length;
for (const t of ['Starting codex ai...', 'Loading environment variables..', '(412) cmds loaded', '[cleanup] removed 3 files',
  '[health] listening on port 3000', '[conn 2026] connection open', '[Startup] error: x', 'connection established',
  'codex ai v3 successfully deployed on panel (pterodactyl)', '[antibug] blocked']) fake.log(t);
fake.warn('library warning'); fake.error('Command error:', new Error('x')); fake.debug('debug'); fake.log({ creds: 1 });

assert.strictEqual(out.length, shown, 'debug/temp/connection output must be silent');
const dumps = out.filter((a) => a[1] === chain).map((a) => a[0]);
assert.deepStrictEqual(dumps, ['Closing session:', 'Removing old closed session:'], 'session chains are printed with their messages');
console.log('ok - quiet panel filter');
