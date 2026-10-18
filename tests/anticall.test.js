// Anti-call decisions must follow the saved configuration exactly.
// Run with: node tests/anticall.test.js
'use strict';
const assert = require('assert');
const { resolveAction, isWithinSchedule, defaultConfig, lagosNow } = require('../lib/anticallManager');
let passed = 0;
const check = (label, fn) => { try { fn(); passed++; console.log(`  ok - ${label}`); } catch (e) { console.error(`  FAIL - ${label}\n    ${e.message}`); process.exitCode = 1; } };
const cfg = (o = {}) => ({ ...JSON.parse(JSON.stringify(defaultConfig)), ...o });
const call = { from: '2348011111111@s.whatsapp.net' };

check('anticall OFF: calls are allowed (not rejected)', () => {
  assert.strictEqual(resolveAction(call, cfg({ enabled: false })).action, 'allow');
});
check('anticall ON: reject; block mode ON: block', () => {
  assert.strictEqual(resolveAction(call, cfg({ enabled: true })).action, 'reject');
  assert.strictEqual(resolveAction(call, cfg({ enabled: true, mode: 'block' })).action, 'block');
});
check('whitelist always allowed, even when ON or blacklisted', () => {
  const c = cfg({ enabled: true, whitelist: [call.from], blacklist: [call.from] });
  assert.strictEqual(resolveAction(call, c).action, 'allow');
});
check('whitelist matches the phone JID when the call arrives as a LID', () => {
  const c = cfg({ enabled: true, whitelist: [call.from] });
  assert.strictEqual(resolveAction({ from: '555@lid', callerPn: call.from }, c).action, 'allow');
});
check('blacklist blocks the number; stays blocked when general switch is OFF', () => {
  assert.strictEqual(resolveAction(call, cfg({ enabled: false, blacklist: [call.from] })).action, 'block');
  assert.strictEqual(resolveAction({ from: '2349000000000@s.whatsapp.net' }, cfg({ enabled: false, blacklist: [call.from] })).action, 'allow');
});
check('schedule: calls outside the window ring normally, inside are rejected (Nigeria time)', () => {
  // 10:30 UTC = 11:30 Lagos (UTC+1)
  const at = new Date('2026-10-18T10:30:00Z');
  assert.strictEqual(lagosNow(at).minutes, 11 * 60 + 30);
  const sched = { enabled: true, type: 'always', start: '11:00', end: '12:00', days: [], dates: [], months: [] };
  assert.strictEqual(isWithinSchedule(sched, at), true);
  assert.strictEqual(isWithinSchedule({ ...sched, start: '13:00', end: '14:00' }, at), false);
  assert.strictEqual(isWithinSchedule({ ...sched, start: '22:00', end: '06:00' }, at), false);        // overnight window
  assert.strictEqual(isWithinSchedule({ ...sched, start: '22:00', end: '12:00' }, at), true);
  assert.strictEqual(isWithinSchedule({ ...sched, days: [0] }, at), true);                            // 2026-10-18 is a Sunday
  assert.strictEqual(isWithinSchedule({ ...sched, days: [1, 2] }, at), false);
  assert.strictEqual(isWithinSchedule({ ...sched, dates: [18], months: [9] }, at), true);
  assert.strictEqual(isWithinSchedule({ ...sched, months: [0] }, at), false);
  const off = cfg({ enabled: true, schedule: { ...sched, start: '13:00', end: '14:00' } });
  assert.strictEqual(resolveAction(call, off).reason, 'outside-schedule');
});
check('schedule disabled: always active when ON', () => {
  assert.strictEqual(isWithinSchedule({ enabled: false }), true);
});
console.log(`\n${passed} passed`);
