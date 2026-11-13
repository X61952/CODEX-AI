// .sreact + `.mention -sreact`: sticker-reaction command, saving, and the mention hook.
// Run: node tests/sreact.test.js   (no WhatsApp, no network)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sreact  = require('../commands/owner/sreact.js');
const mention = require('../commands/owner/mention.js');
const { mentionConfig } = mention;
const CFG = path.join(__dirname, '..', 'database', 'mention_config.json');
const backups = [CFG, sreact.SREACT_FILE].map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]);
const prevMention = { ...mentionConfig };

let passed = 0;
async function check(label, fn) {
  try { await fn(); passed++; console.log(`  ok - ${label}`); }
  catch (e) { console.error(`  FAIL - ${label}\n    ${e.stack || e.message}`); process.exitCode = 1; }
}

const makeBot = () => {
  const calls = [];
  return { calls, prefix: '.', sock: { relayMessage: async (...a) => { calls.push(a); } } };
};
const makeMsg = (extra = {}) => {
  const out = [];
  return { out, chat: '123@g.us', key: { id: 'cmd' }, reply: async (t) => { out.push(t); }, ...extra };
};
const targetKey = { remoteJid: '123@g.us', id: 'target-message', participant: '456@s.whatsapp.net', fromMe: false };
const stickerQuoted = (sticker) => ({ key: targetKey, message: { stickerMessage: sticker }, msg: sticker, mtype: 'stickerMessage' });

(async () => {
  console.log('sreact tests:');
  try { fs.rmSync(sreact.SREACT_FILE, { force: true }); } catch {}

  await check('relays the default sticker as an association reaction to the replied message', async () => {
    const bot = makeBot(); const m = makeMsg({ quoted: { key: targetKey, message: { conversation: 'hi' } } });
    await sreact.execute(bot, m, []);
    assert.strictEqual(bot.calls.length, 1);
    assert.strictEqual(bot.calls[0][0], '123@g.us');
    assert.deepStrictEqual(bot.calls[0][1].messageContextInfo.messageAssociation, { associationType: 11, parentMessageKey: targetKey });
    assert.deepStrictEqual(bot.calls[0][1].stickerMessage, sreact.DEFAULT_STICKER_MESSAGE);
    assert.strictEqual(m.out.length, 0);
  });

  await check('.sreact 3 repeats three times; counts above 10 / junk are rejected', async () => {
    const bot = makeBot(); const m = makeMsg({ quoted: { key: targetKey } });
    await sreact.execute(bot, m, ['3']);
    assert.strictEqual(bot.calls.length, 3);
    for (const bad of ['0', '11', 'abc', '2.5']) {
      const b = makeBot(); const mm = makeMsg({ quoted: { key: targetKey } });
      await sreact.execute(b, mm, [bad]);
      assert.strictEqual(b.calls.length, 0, bad);
      assert.ok(/Reply to a message/.test(mm.out[0]), bad);
    }
  });

  await check('without a replied message it asks for one and sends nothing', async () => {
    const bot = makeBot(); const m = makeMsg();
    await sreact.execute(bot, m, []);
    assert.strictEqual(bot.calls.length, 0);
    assert.ok(/Reply to the message/.test(m.out[0]));
  });

  await check('.sreact add saves a replied sticker (bytes as base64) and later reactions use it', async () => {
    const sticker = { url: 'https://example.test/s.webp', mimetype: 'image/webp',
      fileSha256: Buffer.from('sha'), mediaKey: new Uint8Array([1, 2, 3]), fileLength: { low: 42, high: 0, unsigned: false, toString() { return '42'; } } };
    const m = makeMsg({ quoted: stickerQuoted(sticker) });
    await sreact.execute(makeBot(), m, ['add']);
    assert.ok(/saved/i.test(m.out[0]), m.out[0]);
    const saved = JSON.parse(fs.readFileSync(sreact.SREACT_FILE, 'utf8'));
    assert.strictEqual(saved.fileSha256, Buffer.from('sha').toString('base64'));
    assert.strictEqual(saved.mediaKey, Buffer.from([1, 2, 3]).toString('base64'));
    assert.strictEqual(saved.fileLength, '42');
    const bot = makeBot();
    await sreact.execute(bot, makeMsg({ quoted: { key: targetKey } }), []);
    assert.deepStrictEqual(bot.calls[0][1].stickerMessage, saved);
  });

  await check('.sreact add without a replied sticker changes nothing', async () => {
    const before = fs.readFileSync(sreact.SREACT_FILE, 'utf8');
    const m = makeMsg({ quoted: { key: targetKey, message: { conversation: 'x' } } });
    await sreact.execute(makeBot(), m, ['add']);
    assert.ok(/Reply to a sticker/.test(m.out[0]));
    assert.strictEqual(fs.readFileSync(sreact.SREACT_FILE, 'utf8'), before);
  });

  await check('replying to a sticker with .sreact saves it and still reacts', async () => {
    const sticker = { url: 'https://example.test/other.webp', mimetype: 'image/webp' };
    const bot = makeBot();
    await sreact.execute(bot, makeMsg({ quoted: stickerQuoted(sticker) }), []);
    assert.strictEqual(bot.calls.length, 1);
    assert.strictEqual(bot.calls[0][1].stickerMessage.url, sticker.url);
  });

  console.log('mention -sreact tests:');
  const run = async (args, m = makeMsg()) => {
    const out = []; await mention.execute({}, m, { args, reply: async (t) => out.push(t), prefix: '.' }); return out.join('\n');
  };

  await check('.mention -sreact 2 turns it on and persists the repeat count', async () => {
    const out = await run(['-sreact', '2']);
    assert.ok(/STICKER REACTION/.test(out) && /2x/.test(out), out);
    assert.strictEqual(mentionConfig.active, true);
    assert.strictEqual(mentionConfig.action, 'sreact');
    assert.strictEqual(mentionConfig.sreactCount, 2);
    const saved = JSON.parse(fs.readFileSync(CFG, 'utf8'));
    assert.strictEqual(saved.action, 'sreact'); assert.strictEqual(saved.sreactCount, 2);
  });

  await check('.mention -sreact off disables it; bad counts change nothing', async () => {
    await run(['-sreact', 'off']);
    assert.strictEqual(mentionConfig.active, false); assert.strictEqual(mentionConfig.action, '');
    const out = await run(['-sreact', '99']);
    assert.ok(/Usage/.test(out)); assert.strictEqual(mentionConfig.active, false);
  });

  await check('.mention -sreact on a replied sticker replaces the saved sticker reaction', async () => {
    const sticker = { url: 'https://example.test/mention.webp', mimetype: 'image/webp' };
    await run(['-sreact'], makeMsg({ quoted: stickerQuoted(sticker) }));
    assert.strictEqual(mentionConfig.action, 'sreact');
    assert.strictEqual(sreact.loadStickerReactionMessage().url, sticker.url);
  });

  await check('-status and help list the new mode', async () => {
    assert.ok(/SReact/.test(await run(['-status'])));
    assert.ok(/mention -sreact/.test(await run([])));
  });

  // restore anything we touched
  for (const [f, buf] of backups) { if (buf) fs.writeFileSync(f, buf); else { try { fs.rmSync(f, { force: true }); } catch {} } }
  Object.assign(mentionConfig, prevMention);
  console.log(`\n${passed} passed`);
})();
                     
