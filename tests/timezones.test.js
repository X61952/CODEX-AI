// .setvar TIME_ZONE=... drives the whole bot's clock.
// Run with: node tests/timezone.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-tz-'));
process.chdir(dir); fs.mkdirSync('./database');
process.env.CODEX_PROJECT_ROOT = dir;
const Module = require('module'); const orig = Module._resolveFilename;
Module._resolveFilename = function (r, ...a) { if (['fs-extra', 'chalk', 'axios'].includes(r)) { try { return orig.call(this, r, ...a); } catch { return path.join(root, 'tests', '_stubs', r + '.js'); } } return orig.call(this, r, ...a); };
const tz = require(path.join(root, 'lib/timezone.js'));
let passed = 0;
const check = async (l, fn) => { try { await fn(); passed++; console.log(`  ok - ${l}`); } catch (e) { console.error(`  FAIL - ${l}\n    ${e.stack}`); process.exitCode = 1; } };

(async () => {
  await check('normalizes case and rejects junk', () => {
    assert.strictEqual(tz.normalize('africa/lagos'), 'Africa/Lagos');
    assert.strictEqual(tz.normalize('america/new york'), 'America/New_York');
    assert.strictEqual(tz.normalize('Mars/Olympus'), null);
    assert.strictEqual(tz.normalize(''), null);
  });
  await check('default is Africa/Lagos; saved TIME_ZONE wins at boot', () => {
    assert.strictEqual(tz.init(), 'Africa/Lagos');
    fs.writeFileSync('./database/variables.json', JSON.stringify({ TIME_ZONE: 'Asia/Tokyo' }));
    assert.strictEqual(tz.init(), 'Asia/Tokyo');
    fs.writeFileSync('./database/variables.json', '{}');
    assert.strictEqual(tz.init(), 'Africa/Lagos');
  });
  await check('set() moves process-wide local time and notifies listeners', () => {
    let heard = null; tz.onChange((z) => { heard = z; });
    const t = new Date('2026-01-01T00:00:00Z');
    tz.set('Africa/Lagos');  assert.strictEqual(t.getHours(), 1);
    assert.strictEqual(tz.set('asia/tokyo'), 'Asia/Tokyo'); assert.strictEqual(t.getHours(), 9); assert.strictEqual(heard, 'Asia/Tokyo');
    assert.strictEqual(tz.set('nonsense'), null); assert.strictEqual(tz.get(), 'Asia/Tokyo');
    assert.strictEqual(process.env.TZ, 'Asia/Tokyo');
    assert.match(tz.label(), /^Asia\/Tokyo \(GMT\+9\)$/);
    tz.set('Africa/Lagos');
  });
  await check('anticall schedule follows the timezone', () => {
    const { isWithinSchedule } = require(path.join(root, 'lib/anticallManager.js'));
    const at = new Date('2026-10-18T10:30:00Z');   // 11:30 Lagos, 19:30 Tokyo
    const sched = { enabled: true, type: 'always', start: '11:00', end: '12:00', days: [], dates: [], months: [] };
    tz.set('Africa/Lagos'); assert.strictEqual(isWithinSchedule(sched, at), true);
    tz.set('Asia/Tokyo');   assert.strictEqual(isWithinSchedule(sched, at), false);
    tz.set('Africa/Lagos');
  });
  await check('.setvar TIME_ZONE=africa/lagos saves the canonical name; bad zones are refused', async () => {
    const cmd = require(path.join(root, 'commands/owner/setvar.js'));
    const replies = []; const m = { reply: async (t) => replies.push(t) }; const bot = { prefix: '.', config: {} };
    await cmd.execute(bot, m, ['TIME_ZONE=asia/dubai']);
    assert.strictEqual(JSON.parse(fs.readFileSync('./database/variables.json', 'utf8')).TIME_ZONE, 'Asia/Dubai');
    assert.strictEqual(tz.get(), 'Asia/Dubai'); assert.match(replies[0], /Asia\/Dubai \(GMT\+4\)/);
    await cmd.execute(bot, m, ['TIME_ZONE=africa/lagos']);
    assert.strictEqual(JSON.parse(fs.readFileSync('./database/variables.json', 'utf8')).TIME_ZONE, 'Africa/Lagos');
    await cmd.execute(bot, m, ['TIME_ZONE=moon/base']);
    assert.match(replies[2], /not a valid timezone/);
    assert.strictEqual(JSON.parse(fs.readFileSync('./database/variables.json', 'utf8')).TIME_ZONE, 'Africa/Lagos');
    assert.strictEqual(tz.get(), 'Africa/Lagos');
  });
  await check('supports every IANA timezone (all of them normalize, apply, and format)', () => {
    const zones = Intl.supportedValuesOf('timeZone');
    assert.ok(zones.length > 400, 'expected the full IANA list, got ' + zones.length);
    for (const z of zones) {
      assert.ok(tz.normalize(z), z);
      assert.ok(tz.normalize(z.toLowerCase()), z.toLowerCase());
      assert.strictEqual(tz.set(z) !== null, true, z);
      assert.ok(new Date().toLocaleString('en-US', { timeZone: tz.get() }), z);
      assert.ok(tz.label(), z);
    }
    for (const z of ['UTC', 'Asia/Calcutta', 'US/Eastern', 'Etc/GMT+5', 'Asia/Kathmandu', 'Pacific/Kiritimati', 'Pacific/Chatham', 'America/St_Johns']) assert.ok(tz.normalize(z), z);
    tz.set('Africa/Lagos');
  });
  await check('abbreviations and UTC offsets are understood', () => {
    assert.strictEqual(tz.normalize('WAT'), 'Africa/Lagos');
    assert.strictEqual(tz.normalize('est'), 'America/New_York');
    assert.ok(['Asia/Kolkata', 'Asia/Calcutta'].includes(tz.normalize('IST')));   // Node/ICU spells it Calcutta
    assert.strictEqual(tz.normalize('UTC'), 'UTC');
    tz.set('UTC+1'); assert.strictEqual(new Date('2026-01-01T00:00:00Z').getHours(), 1);
    tz.set('GMT-5'); assert.strictEqual(new Date('2026-01-01T00:00:00Z').getHours(), 19);
    tz.set('+05:30'); assert.ok(['Asia/Kolkata', 'Asia/Calcutta'].includes(tz.get()));
    assert.strictEqual(tz.normalize('UTC+25'), null);
    tz.set('Africa/Lagos');
  });
  await check('mute-core re-arms recurring cron jobs in the new zone', async () => {
    const used = []; const stopped = [];
    const cronStub = { schedule: (expr, fn, opts) => { const job = { expr, zone: opts?.timezone, stop: () => stopped.push(opts?.timezone) }; used.push(job); return job; } };
    const real = Module._resolveFilename;
    Module._resolveFilename = function (r, ...a) { return r === 'node-cron' ? 'node-cron-stub' : real.call(this, r, ...a); };
    require.cache['node-cron-stub'] = { id: 'node-cron-stub', filename: 'node-cron-stub', loaded: true, exports: cronStub };
    const mc = require(path.join(root, 'lib/mute-core.js'));
    Module._resolveFilename = real;
    tz.set('Africa/Lagos');
    mc.init({ sock: {}, config: {} });
    const before = used.length;
    mc.addRecurring({ chat: 'g@g.us', type: 'sch-muteGroup', mutedBy: 'x', timeFrom: { hour: 1, minute: 0 }, timeTo: { hour: 6, minute: 0 } });
    const added = used.slice(before);
    assert.deepStrictEqual(added.map((j) => j.zone), ['Africa/Lagos', 'Africa/Lagos']);
    tz.set('America/New_York');
    assert.deepStrictEqual(stopped, ['Africa/Lagos', 'Africa/Lagos'], 'old-zone jobs stopped');
    const rearmed = used.slice(before + 2);
    assert.deepStrictEqual(rearmed.map((j) => j.zone), ['America/New_York', 'America/New_York'], 'armed again in the new zone');
    assert.deepStrictEqual(rearmed.map((j) => j.expr), added.map((j) => j.expr));
    tz.set('Africa/Lagos');
  });
  console.log(`\n${passed} passed`);
})();
  
