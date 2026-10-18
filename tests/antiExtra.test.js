// Tests for AntiBug + the newer anti-systems (AntiImage/Audio/Doc/Poll/Event/
// Location/Contact, AntiNewcomerLinks, AntiRaid, ModLog,
// AntiPromote) and the auto-leave plugin.
// Run with: node tests/antiExtra.test.js   (no network, no WhatsApp)
'use strict';
const assert = require('assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'fs-extra' || req === 'chalk' || req === 'axios') {
    try { return origResolve.call(this, req, ...rest); }
    catch { return path.join(root, 'tests', '_stubs', req + '.js'); }
  }
  return origResolve.call(this, req, ...rest);
};
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-extra-')));
fs.mkdirSync('./database');

const Permission = require(path.join(root, 'lib', 'permission.js'));
const AntiSystems = require(path.join(root, 'lib', 'antiSystems.js'));
const { detectBug } = require(path.join(root, 'lib', 'antiBug.js'));
const EXTRA = AntiSystems;   // engine API (readModLog / buildPanel / dbOf ...) lives on AntiSystems
const NEW_KEYS = ['antiimage', 'antiaudio', 'antidoc', 'antipoll', 'antievent', 'antilocation', 'anticontact',
  'antinewcomerlinks', 'antiraid', 'antipromote', 'modlog'];
const readCfg = (key) => (JSON.parse(fs.readFileSync(EXTRA.dbOf(key), 'utf8'))[GROUP]);
const autoLeave = require(path.join(root, 'plugins', 'autoleave.js'));

let passed = 0;
async function check(label, fn) {
  try { await fn(); passed++; console.log(`  ok - ${label}`); }
  catch (e) { console.error(`  FAIL - ${label}\n    ${e.stack || e.message}`); process.exitCode = 1; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GROUP = '1203630@g.us';
const USER = '2348011111111@s.whatsapp.net';
const ADMIN = '2348022222222@s.whatsapp.net';
const meta = { participants: [
  { id: '19990000000@s.whatsapp.net', admin: 'admin' },
  { id: USER, admin: null },
  { id: ADMIN, admin: 'admin' },
] };

function mkBot(botIsAdmin = true) {
  const calls = { sent: [], deleted: 0, blocked: [], kicked: [], updates: [], left: [] };
  const bot = {
    config: { owner: { number: '2340000000000' }, mods: [], sudo: [] },
    prefix: '.',
    sock: {
      user: { id: '19990000000:3@s.whatsapp.net', lid: '55500011122@lid' },
      ev: { on() {} },
      groupMetadata: async () => botIsAdmin ? meta : { participants: meta.participants.map((p) => ({ ...p, admin: p.id.startsWith('1999') ? null : p.admin })) },
      sendMessage: async (jid, content) => { if (content.delete) calls.deleted++; else calls.sent.push(content); },
      updateBlockStatus: async (jid, act) => { calls.blocked.push([jid, act]); },
      groupParticipantsUpdate: async (g, ids, act) => { calls.updates.push([act, ids]); if (act === 'remove') calls.kicked.push(...ids); },
      groupLeave: async (g) => { calls.left.push(g); },
    },
  };
  bot.permission = new Permission(bot);
  bot.sendMessage = bot.sock.sendMessage;
  bot.antiSystems = new AntiSystems(bot);
  return { bot, calls };
}
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data));
const writeExtra = (obj) => { for (const k of NEW_KEYS) write(EXTRA.dbOf(k), { [GROUP]: obj[k] || { enabled: false } }); };
const msg = (type, extra = {}) => ({ isGroup: true, chat: GROUP, fromMe: false, key: { fromMe: false, id: 'X' },
  sender: USER, text: '', type, mentions: [], msg: {}, message: { [type]: {} }, ...extra });

(async () => {
  console.log('detectBug:');
  const d = (message, sender = 's', floods = new Map()) => detectBug(message, { sender, floods });

  await check('ordinary messages are never flagged', () => {
    assert.strictEqual(d({ conversation: 'hello there' }), null);
    assert.strictEqual(d({ extendedTextMessage: { text: 'see https://example.com', contextInfo: { mentionedJid: ['a@s.whatsapp.net'] } } }), null);
    assert.strictEqual(d({ imageMessage: { height: 1080, width: 1920, caption: 'hi' } }), null);
    assert.strictEqual(d({ documentMessage: { fileName: 'report.pdf', pageCount: 12 } }), null);
    assert.strictEqual(d({ stickerMessage: { height: 512, width: 512 } }), null);
    assert.strictEqual(d({ locationMessage: { degreesLatitude: 6.5, degreesLongitude: 3.3, name: 'Lagos' } }), null);
  });
  await check('text walls, invisible-character walls and mention walls', () => {
    assert.match(d({ conversation: 'a'.repeat(20000) }), /text wall/);
    assert.match(d({ conversation: 'ab' + '\u200B'.repeat(900) }), /invisible/);
    assert.match(d({ extendedTextMessage: { text: 'hi', contextInfo: { mentionedJid: new Array(3000).fill('x@s.whatsapp.net') } } }), /mention wall/);
  });
  await check('huge channel admin invite (size) and channel invite flooding', () => {
    assert.match(d({ newsletterAdminInviteMessage: { caption: 'x'.repeat(900) } }), /huge channel admin invite/);
    const f = new Map();
    assert.strictEqual(d({ newsletterAdminInviteMessage: { caption: 'join' } }, 'a', f), null);
    assert.match(d({ newsletterAdminInviteMessage: { caption: 'join' } }, 'a', f), /flooding/);
  });
  await check('sticker pack flooding and oversized packs', () => {
    const f = new Map(); const sp = { stickerPackMessage: { name: 'pack', stickers: [{}] } };
    assert.strictEqual(d(sp, 'a', f), null); assert.strictEqual(d(sp, 'a', f), null);
    assert.match(d(sp, 'a', f), /sticker pack flooding/);
    assert.match(d({ stickerPackMessage: { stickers: new Array(200).fill({}) } }), /oversized sticker pack/);
  });
  await check('status-mention flooding (private) and huge status mention', () => {
    const f = new Map(); const sm = { statusMentionMessage: {} };
    d(sm, 'a', f); d(sm, 'a', f);
    assert.match(d(sm, 'a', f), /status mention flooding/);
    assert.match(d({ groupStatusMentionMessage: { contextInfo: { mentionedJid: new Array(3000).fill('x') } } }), /huge status mention/);
    const f2 = new Map(); const pm = { protocolMessage: { type: 25 } };
    d(pm, 'b', f2); d(pm, 'b', f2);
    assert.match(d(pm, 'b', f2), /status mention flooding/);
  });
  await check('file flooding, absurd documents, per-sender isolation', () => {
    const f = new Map(); const doc = { documentMessage: { fileName: 'a.zip' } };
    for (let i = 0; i < 4; i++) assert.strictEqual(d(doc, 'a', f), null);
    assert.match(d(doc, 'a', f), /file flooding/);
    assert.strictEqual(d(doc, 'someone-else', f), null);
    assert.match(d({ documentMessage: { pageCount: 99999999 } }), /page count/);
    assert.match(d({ documentMessage: { fileName: 'x'.repeat(900) } }), /oversized name/);
  });
  await check('oversized interactive/vcard/poll/location/event and nested wrappers', () => {
    assert.match(d({ interactiveMessage: { nativeFlowMessage: { messageParamsJson: 'x'.repeat(50000) } } }), /oversized interactive payload/);
    assert.match(d({ contactMessage: { vcard: 'x'.repeat(50000) } }), /contact card/);
    assert.match(d({ pollCreationMessage: { name: 'q', options: new Array(40).fill({ optionName: 'a' }) } }), /oversized poll/);
    assert.match(d({ locationMessage: { degreesLatitude: 999, degreesLongitude: 3 } }), /coordinates/);
    assert.match(d({ eventMessage: { name: 'x'.repeat(5000) } }), /oversized event/);
    let nested = { conversation: 'x' };
    for (let i = 0; i < 7; i++) nested = { ephemeralMessage: { message: nested } };
    assert.match(d(nested), /nested/);
  });

  console.log('AntiBug (checkBug):');
  await check('bug message in a group: deleted, sender blocked + removed, one notice', async () => {
    write('./database/antibug.json', {});
    const { bot, calls } = mkBot();
    const m = msg('conversation', { message: { conversation: 'a'.repeat(30000) } });
    assert.strictEqual(await bot.antiSystems.checkBug(m), true);
    assert.ok(calls.deleted >= 1);
    assert.deepStrictEqual(calls.blocked[0], [USER, 'block']);
    assert.deepStrictEqual(calls.kicked, [USER]);
    assert.strictEqual(calls.sent.length, 1);
    // same sender again: still swallowed, no second block / notice
    assert.strictEqual(await bot.antiSystems.checkBug(m), true);
    assert.strictEqual(calls.blocked.length, 1);
    assert.strictEqual(calls.sent.length, 1);
  });
  await check('bug message in a DM: sender blocked (works with no admin rights)', async () => {
    const { bot, calls } = mkBot(false);
    const dm = { isGroup: false, chat: USER, fromMe: false, key: { fromMe: false, id: 'Y' }, sender: USER,
      message: { documentMessage: { pageCount: 99999999999 } } };
    assert.strictEqual(await bot.antiSystems.checkBug(dm), true);
    assert.deepStrictEqual(calls.blocked[0], [USER, 'block']);
    assert.strictEqual(calls.sent.length, 0);
  });
  await check('group where bot is not admin: still blocked, not kicked', async () => {
    const { bot, calls } = mkBot(false);
    await bot.antiSystems.checkBug(msg('conversation', { message: { conversation: 'a'.repeat(30000) } }));
    assert.strictEqual(calls.blocked.length, 1);
    assert.strictEqual(calls.kicked.length, 0);
  });
  await check('group admin is NOT exempt from AntiBug; owner and bot are', async () => {
    const big = { conversation: 'a'.repeat(30000) };
    let t = mkBot();
    assert.strictEqual(await t.bot.antiSystems.checkBug(msg('conversation', { sender: ADMIN, message: big })), true);
    t = mkBot();
    assert.strictEqual(await t.bot.antiSystems.checkBug(msg('conversation', { sender: '2340000000000@s.whatsapp.net', message: big })), false);
    t = mkBot();
    assert.strictEqual(await t.bot.antiSystems.checkBug(msg('conversation', { fromMe: true, key: { fromMe: true }, message: big })), false);
    assert.strictEqual(t.calls.blocked.length, 0);
  });
  await check('.antibug off (group) and global off disable it; normal text untouched', async () => {
    const big = msg('conversation', { message: { conversation: 'a'.repeat(30000) } });
    write('./database/antibug.json', { [GROUP]: { enabled: false } });
    let t = mkBot(); assert.strictEqual(await t.bot.antiSystems.checkBug(big), false);
    await sleep(15);
    write('./database/antibug.json', { _global: { enabled: false } });
    t = mkBot(); assert.strictEqual(await t.bot.antiSystems.checkBug(big), false);
    await sleep(15);
    write('./database/antibug.json', {});
    t = mkBot(); assert.strictEqual(await t.bot.antiSystems.checkBug(msg('conversation', { message: { conversation: 'hi' } })), false);
    assert.strictEqual(t.calls.blocked.length, 0);
  });

  console.log('content-type anti-systems:');
  const ON = { enabled: true, action: 'delete' };
  const cases = [
    ['antiimage',    msg('imageMessage'),                                   msg('videoMessage')],
    ['antiaudio',    msg('audioMessage', { msg: { ptt: false } }),          msg('audioMessage', { msg: { ptt: true } })],
    ['antidoc',      msg('documentMessage'),                                msg('imageMessage')],
    ['antipoll',     msg('pollCreationMessageV3'),                          msg('conversation')],
    ['antievent',    msg('eventMessage'),                                   msg('conversation')],
    ['antilocation', msg('liveLocationMessage'),                            msg('conversation')],
    ['anticontact',  msg('contactsArrayMessage'),                           msg('conversation')],
  ];
  for (const [key, bad, ok] of cases) {
    await check(`${key}: blocks its type, leaves others, admins exempt`, async () => {
      writeExtra({ [key]: ON });
      const { bot, calls } = mkBot();
      assert.strictEqual(bot.antiSystems._hasActiveFeature(bad), true);
      assert.strictEqual(await bot.antiSystems.checkAll(bad), true);
      assert.ok(calls.deleted >= 1);
      assert.strictEqual(await bot.antiSystems.checkAll(ok), false);
      assert.strictEqual(await bot.antiSystems.checkAll({ ...bad, sender: ADMIN }), false);
      await sleep(15);
    });
  }
  await check('kick / warn actions work for the new content bans', async () => {
    writeExtra({ antiimage: { enabled: true, action: 'kick' } });
    let t = mkBot(); await t.bot.antiSystems.checkAll(msg('imageMessage')); assert.deepStrictEqual(t.calls.kicked, [USER]);
    await sleep(15);
    fs.writeFileSync('./database/warnings.json', '{}');
    writeExtra({ antiimage: { enabled: true, action: 'warn', maxWarns: 2 } });
    t = mkBot(); await t.bot.antiSystems.checkAll(msg('imageMessage')); assert.strictEqual(t.calls.kicked.length, 0);
    await t.bot.antiSystems.checkAll(msg('imageMessage')); assert.deepStrictEqual(t.calls.kicked, [USER]);
  });
  await check('nothing enabled in the new anti files: group stays on the fast path', async () => {
    await sleep(15);
    writeExtra({ antiimage: { enabled: false }, antipromote: { enabled: true }, modlog: { enabled: true } });
    const { bot } = mkBot();
    assert.strictEqual(bot.antiSystems._hasActiveFeature(msg('imageMessage')), false);
  });

  console.log('behaviour anti-systems:');
  await check('antinewcomerlinks: link from a fresh joiner deleted, old member / non-link untouched', async () => {
    await sleep(15);
    writeExtra({ antinewcomerlinks: { enabled: true, action: 'delete', minutes: 10 } });
    const { bot, calls } = mkBot();
    await bot.antiSystems.checkGroupJoin(GROUP, [USER]);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('conversation', { text: 'visit https://x.example' })), true);
    assert.ok(calls.deleted >= 1);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('conversation', { text: 'hello' })), false);
    const other = '2348033333333@s.whatsapp.net';
    assert.strictEqual(await bot.antiSystems.checkAll(msg('conversation', { sender: other, text: 'https://x.example' })), false);
    bot.antiSystems._joinTimes.set(`${GROUP}_${bot.antiSystems._userKey(USER)}`, Date.now() - 11 * 60 * 1000);
    assert.strictEqual(await bot.antiSystems.checkAll(msg('conversation', { text: 'https://x.example' })), false);
  });
  await check('antiraid: 5 joins in the window are removed together, later joiners removed on arrival', async () => {
    await sleep(15);
    writeExtra({ antiraid: { enabled: true, count: 5, minutes: 10 } });
    const { bot, calls } = mkBot();
    const ids = [1, 2, 3, 4].map((i) => `23480000000${i}@s.whatsapp.net`);
    await bot.antiSystems.checkGroupJoin(GROUP, ids);
    assert.strictEqual(calls.kicked.length, 0);
    await bot.antiSystems.checkGroupJoin(GROUP, ['234800000005@s.whatsapp.net']);
    assert.strictEqual(calls.kicked.length, 5);
    await bot.antiSystems.checkGroupJoin(GROUP, ['234800000006@s.whatsapp.net']);
    assert.strictEqual(calls.kicked.length, 6);
  });
  await check('modlog: records actions when on, honours retention, not when off', async () => {
    await sleep(15);
    fs.writeFileSync('./database/modlog.json', '{}');
    writeExtra({ antiimage: ON, modlog: { enabled: true, days: 30 } });
    const { bot } = mkBot();
    await bot.antiSystems.checkAll(msg('imageMessage'));
    let log = EXTRA.readModLog(GROUP);
    assert.strictEqual(log.length, 1); assert.strictEqual(log[0].reason, 'Images are not allowed');
    write('./database/modlog.json', { [GROUP]: [{ t: Date.now() - 40 * 86400000, user: USER, action: 'old', reason: 'old' }] });
    await sleep(15);
    await bot.antiSystems.checkAll(msg('imageMessage'));
    log = EXTRA.readModLog(GROUP);
    assert.strictEqual(log.length, 1);   // 40-day-old entry pruned
    await sleep(15);
    writeExtra({ antiimage: ON, modlog: { enabled: false } });
    fs.writeFileSync('./database/modlog.json', '{}');
    await bot.antiSystems.checkAll(msg('imageMessage'));
    assert.strictEqual(EXTRA.readModLog(GROUP).length, 0);
  });
  await check('antipromote: revert strangers, allow owner / bot / self / mods', async () => {
    await sleep(15);
    writeExtra({ antipromote: { enabled: true } });
    let t = mkBot();
    await t.bot.antiSystems.checkAdminChange(GROUP, [USER], 'promote', ADMIN);
    assert.deepStrictEqual(t.calls.updates, [['demote', [USER]]]);
    t = mkBot();   // demotions are not handled by this feature
    await t.bot.antiSystems.checkAdminChange(GROUP, [ADMIN], 'demote', '2348077777777@s.whatsapp.net');
    assert.strictEqual(t.calls.updates.length, 0);
    for (const author of ['2340000000000@s.whatsapp.net', '19990000000@s.whatsapp.net']) {   // owner, bot
      t = mkBot();
      await t.bot.antiSystems.checkAdminChange(GROUP, [USER], 'promote', author);
      assert.strictEqual(t.calls.updates.length, 0);
    }
    t = mkBot();   // admin stepping down on their own
    await t.bot.antiSystems.checkAdminChange(GROUP, [ADMIN], 'demote', ADMIN);
    assert.strictEqual(t.calls.updates.length, 0);
    t = mkBot();   // unknown actor: do nothing
    await t.bot.antiSystems.checkAdminChange(GROUP, [USER], 'promote', undefined);
    assert.strictEqual(t.calls.updates.length, 0);
    t = mkBot();   // owner promoted by a stranger: never demote the owner
    await t.bot.antiSystems.checkAdminChange(GROUP, ['2340000000000@s.whatsapp.net'], 'promote', ADMIN);
    assert.strictEqual(t.calls.updates.length, 0);
    t = mkBot(false);   // bot not admin: cannot revert
    await t.bot.antiSystems.checkAdminChange(GROUP, [USER], 'promote', ADMIN);
    assert.strictEqual(t.calls.updates.length, 0);
  });

  console.log('commands, panel and plugin:');
  await check('every new toggle command loads and toggles its setting', async () => {
    const keys = NEW_KEYS;
    for (const key of keys) {
      const cmd = require(path.join(root, 'commands', 'admin', `${key}.js`));
      assert.strictEqual(cmd.name, key);
      const replies = [];
      const m = { chat: GROUP, reply: async (t) => replies.push(t) };
      await cmd.execute({ prefix: '.' }, m, ['on']);
      assert.strictEqual(readCfg(key).enabled, true, key);
      await cmd.execute({ prefix: '.' }, m, ['off']);
      assert.strictEqual(readCfg(key).enabled, false, key);
      await cmd.execute({ prefix: '.' }, m, ['status']);
      assert.match(replies[replies.length - 1], /status/);
    }
    const replies = []; const m = { chat: GROUP, reply: async (t) => replies.push(t) };
    await require(path.join(root, 'commands/admin/antiraid.js')).execute({ prefix: '.' }, m, ['8', '15']);
    assert.deepStrictEqual([readCfg('antiraid').count, readCfg('antiraid').minutes], [8, 15]);
    await require(path.join(root, 'commands/admin/modlog.js')).execute({ prefix: '.' }, m, ['days', '7']);
    assert.strictEqual(readCfg('modlog').days, 7);
    await require(path.join(root, 'commands/admin/antiimage.js')).execute({ prefix: '.' }, m, ['warn', '2']);
    assert.deepStrictEqual([readCfg('antiimage').action, readCfg('antiimage').maxWarns], ['warn', 2]);
  });
  await check('.antis preset applies the requested configuration and the panel prints every anti-system', async () => {
    const antis = require(path.join(root, 'commands/admin/antis.js'));
    const replies = []; const m = { chat: GROUP, reply: async (t) => replies.push(t) };
    await antis.execute({ prefix: '.' }, m, ['preset']);
    const panel = EXTRA.buildPanel(GROUP);
    const expected = [
      'AntiLink: ON (delete)', 'AntiGM: ON (delete)', 'AntiBot: OFF (delete)', 'AntiForward: ON (delete)',
      'AntiGroupStatus: ON (kick)', 'AntiWord: OFF (delete)', 'AntiTag: OFF (delete)', 'AntiSpam: ON (delete)',
      'AntiVV: OFF (delete)', 'AntiBug: ON (block)', 'AntiImage: OFF (delete)', 'AntiVideo: OFF (delete)',
      'AntiAudio: OFF (delete)', 'AntiVoice: OFF (delete)', 'AntiDoc: OFF (delete)', 'AntiPoll: OFF (delete)',
      'AntiEvent: OFF (delete)', 'AntiNewcomerLinks: ON (10m)', 'AntiRaid: ON (5/10m)', 'AntiLocation: OFF (delete)',
      'AntiContact: OFF (delete)', 'ModLog: OFF (30d retention)', 'NoSticker: OFF (delete)',
      'AntiPromote: ON',
    ];
    assert.deepStrictEqual(panel.split('\n').map((l) => l.replace(/^• /, '')), expected);
  });
  await check('autoleave plugin: leaves with the exact text only when ON and the bot itself was added', async () => {
    fs.writeFileSync('./database/autoleave.json', JSON.stringify({ enabled: false }));
    let t = mkBot();
    assert.strictEqual(await autoLeave.onGroupJoin(t.bot, 'new1@g.us', ['19990000000@s.whatsapp.net']), false);
    assert.strictEqual(t.calls.left.length, 0);
    const cmdReplies = []; const m = { reply: async (x) => cmdReplies.push(x) };
    await autoLeave.execute({ prefix: '.' }, m, ['on']);
    assert.strictEqual(autoLeave.isEnabled(), true);
    t = mkBot();
    assert.strictEqual(await autoLeave.onGroupJoin(t.bot, 'new2@g.us', [USER]), false);          // someone else joined
    assert.strictEqual(t.calls.left.length, 0);
    assert.strictEqual(await autoLeave.onGroupJoin(t.bot, 'new3@g.us', [{ id: '19990000000@s.whatsapp.net' }]), true);
    assert.deepStrictEqual(t.calls.sent, [{ text: '_Leaving now..._' }]);
    assert.deepStrictEqual(t.calls.left, ['new3@g.us']);
    await autoLeave.onGroupJoin(t.bot, 'new3@g.us', ['19990000000@s.whatsapp.net']);              // duplicate event ignored
    assert.strictEqual(t.calls.left.length, 1);
    t = mkBot(); t.bot._joinedByCommand = new Map([['new4@g.us', Date.now()]]);                    // owner's own .join
    assert.strictEqual(await autoLeave.onGroupJoin(t.bot, 'new4@g.us', ['19990000000@s.whatsapp.net']), false);
    assert.strictEqual(t.calls.left.length, 0);
    t = mkBot();                                                                                   // upsert replay right after connect
    t.bot._openAt = Date.now();
    assert.strictEqual(await autoLeave.onGroupUpsert(t.bot, { id: 'old@g.us', participants: [{ id: '19990000000@s.whatsapp.net' }] }), false);
    t.bot._openAt = Date.now() - 5 * 60 * 1000;
    assert.strictEqual(await autoLeave.onGroupUpsert(t.bot, { id: 'fresh@g.us', participants: [{ id: '19990000000@s.whatsapp.net' }] }), true);
    await autoLeave.execute({ prefix: '.' }, m, ['off']);
    assert.strictEqual(autoLeave.isEnabled(), false);
  });

  await check('antibug mode: group-only ignores DMs, dm-only ignores groups, both covers each', async () => {
    const grp = msg('conversation', { message: { conversation: 'a'.repeat(30000) } });
    const dm = { isGroup: false, chat: USER, fromMe: false, key: { fromMe: false, id: 'Z' }, sender: USER, message: { conversation: 'a'.repeat(30000) } };
    const run = async (mode, m) => { write('./database/antibug.json', mode ? { _mode: mode } : {}); await sleep(15); const t = mkBot(); return t.bot.antiSystems.checkBug(m); };
    assert.strictEqual(await run('group', grp), true);
    assert.strictEqual(await run('group', dm), false);
    assert.strictEqual(await run('dm', dm), true);
    assert.strictEqual(await run('dm', grp), false);
    assert.strictEqual(await run('both', dm), true);
    assert.strictEqual(await run(null, grp), true);
    const cmd = require(path.join(root, 'commands/admin/antibug.js')); const replies = [];
    await cmd.execute({ prefix: '.', permission: { isOwner: () => true } }, { chat: GROUP, isGroup: true, sender: '2340000000000@s.whatsapp.net', key: {}, reply: async (x) => replies.push(x) }, ['mode', 'dm']);
    assert.strictEqual(JSON.parse(fs.readFileSync('./database/antibug.json', 'utf8'))._mode, 'dm');
    write('./database/antibug.json', {});
  });
  await check('eval: output only (no header/timing), noPrefix, silent when empty', async () => {
    const ev = require(path.join(root, 'commands/owner/eval.js'));
    assert.strictEqual(ev.noPrefix, true);
    const sent = []; const bot = { prefix: '.', sock: { sendMessage: async (j, c) => { sent.push(c); } } };
    const m = { chat: GROUP, key: { id: 'k' }, message: {}, reply: async () => { throw new Error('must not use reply'); } };
    await ev.execute(bot, m, ['1+1']);
    await ev.execute(bot, m, ['console.log("hi")']);
    await ev.execute(bot, m, ['(()=>{', 'throw', 'new', 'Error("boom")})()']);
    assert.deepStrictEqual(sent.filter((c) => c.text).map((c) => c.text), ['2', 'hi', 'boom']);
  });

  console.log(`\n${passed} passed`);
})();
