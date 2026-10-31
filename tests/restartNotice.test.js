'use strict';
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.CODEX_PROJECT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-rn-'));
const rn = require('../lib/restartNotice');
let n = 0; const check = async (l, f) => { try { await f(); n++; console.log('  ok - ' + l); } catch (e) { console.error('  FAIL - ' + l + '\n' + e.stack); process.exitCode = 1; } };
const botWith = (sent) => ({ sock: { sendMessage: async (jid, c) => { sent.push([jid, c.text]); } } });
(async () => {
    await check('nothing waiting → nothing sent', async () => { const s = []; assert.strictEqual(await rn.deliver(botWith(s)), false); assert.deepStrictEqual(s, []); });
    await check('restart → exact message, once, to the same chat', async () => {
        const s = []; assert.ok(rn.mark('restart', '123@g.us'));
        assert.strictEqual(await rn.deliver(botWith(s)), true);
        assert.deepStrictEqual(s, [['123@g.us', '_Restart Complete ✅_\n\n*BOT IS ONLINE AGAIN ✅*']]);
        assert.strictEqual(await rn.deliver(botWith(s)), false); assert.strictEqual(s.length, 1);
    });
    await check('update → exact update message', async () => {
        const s = []; rn.mark('update', 'a@s.whatsapp.net'); await rn.deliver(botWith(s));
        assert.deepStrictEqual(s, [['a@s.whatsapp.net', '_Restart Complete_\n\n*BOT IS NOW UP TO DATE ✅*']]);
    });
    await check('stale notice (older than 15 min) is dropped, bad input ignored', async () => {
        fs.mkdirSync(path.dirname(rn.FILE), { recursive: true });
        fs.writeFileSync(rn.FILE, JSON.stringify({ type: 'restart', chat: 'x@g.us', at: Date.now() - 16 * 60 * 1000 }));
        const s = []; assert.strictEqual(await rn.deliver(botWith(s)), false); assert.strictEqual(s.length, 0); assert.ok(!fs.existsSync(rn.FILE));
        assert.strictEqual(rn.mark('bogus', 'x'), false); assert.strictEqual(rn.mark('restart', ''), false);
    });
    await check('powerControl.restart leaves the marker for that chat', async () => {
        const pc = require('../lib/powerControl'); const realExit = process.exit; let code;
        process.exit = (c) => { code = c; }; const t = setTimeout;
        global.setTimeout = (f) => { f(); return { unref() {} }; };
        try { pc.restart({}, { chat: 'c@g.us' }); } finally { global.setTimeout = t; process.exit = realExit; }
        assert.strictEqual(code, 1); assert.strictEqual(JSON.parse(fs.readFileSync(rn.FILE, 'utf8')).chat, 'c@g.us');
        fs.unlinkSync(rn.FILE);
    });
    console.log(`\n${n} checks passed`);
})();
          
