/**
 * $ <code> — run a JS snippet on the live bot process (owner and mods).
 * For shell commands, use .shell / .sh instead (commands/bot/shell.js).
 *
 * Note: this project's `m` object does NOT have an `m.quoted` convenience
 * field like some other bot frameworks — use `m.msg?.contextInfo?.quotedMessage`
 * if you need the quoted message inside a snippet.
 */
const util = require('util');
const fs   = require('fs-extra');
const { exec } = require('child_process');

module.exports = {
    name: '$',
    aliases: [],
    category: 'owner',
    reactions: { start: '🔐' },
    description: 'Run a JS snippet on the live bot process',
    usage: '$ <code>',
    ownerOnly: true,
    // Triggers ONLY as a bare `$ <code>` — `.$ <code>` (with the prefix) does nothing.
    noPrefix: true,

    async execute(bot, m, args) {
        const text = args.join(' ').trim();
        if (!text) return;

        // Output only — no header, no timing, no code fence. Sent straight
        // through the socket so the bot's font/emoji styling can't alter it.
        const out = async (t) => {
            const text = String(t).slice(0, 4000);
            try { return await bot.sock.sendMessage(m.chat, { text }, { quoted: m._raw }); }
            catch { return await m.reply(text); }   // same path every other command uses
        };

        const sock = bot.sock; // convenience alias for snippets written against `sock`

        let consoleOutput = '';
        const originalLog   = console.log;
        const originalError = console.error;
        const originalWarn  = console.warn;

        const capture = (prefix) => (...a) => {
            consoleOutput += prefix + a.map(x =>
                typeof x === 'object' ? util.inspect(x, { depth: 3, colors: false }) : String(x)
            ).join(' ') + '\n';
        };
        console.log   = capture('');
        console.error = capture('❌ ');
        console.warn  = capture('⚠️ ');

        // ── Helpers available inside eval'd code ────────────────────────────
        const quoted = { quoted: { key: m.key, message: m.message } };

        const _resolveSource = (source) => {
            if (typeof source === 'string' && source.startsWith('http')) return { url: source };
            return Buffer.isBuffer(source) ? source : fs.readFileSync(source);
        };
        const sendImage = (source, caption = '') => bot.sock.sendMessage(m.chat, { image: _resolveSource(source), caption }, quoted);
        const sendVideo = (source, caption = '') => bot.sock.sendMessage(m.chat, { video: _resolveSource(source), caption }, quoted);
        const sendAudio = (source, ptt = false)   => bot.sock.sendMessage(m.chat, { audio: _resolveSource(source), ptt }, quoted);
        const sendFile  = (source, filename = 'file') => bot.sock.sendMessage(m.chat, { document: _resolveSource(source), fileName: filename }, quoted);

        const shell = (cmd) => new Promise((resolve, reject) => {
            exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => err ? reject(stderr || err.message) : resolve(stdout));
        });
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        try {
            const isMultiLine     = text.includes('\n');
            const hasDeclaration  = /^\s*(const|let|var|function|class|if|for|while|try|switch)/m.test(text);
            const wrappedCode = (isMultiLine || hasDeclaration)
                ? `(async () => { ${text} })()`
                : `(async () => { return ${text} })()`;

            let result = await eval(wrappedCode);

            console.log   = originalLog;
            console.error = originalError;
            console.warn  = originalWarn;

            const wantsRaw  = text.includes('.raw') || text.includes('//raw');

            const isWaSendResponse = (r) => {
                if (!r) return false;
                if (r.message?.reactionMessage) return true;
                if (r.key && r.messageTimestamp && !r.conversation && !r.text) return true;
                return false;
            };
            const isSendResponse = !wantsRaw && isWaSendResponse(result);

            let output = '';
            if (consoleOutput) output += consoleOutput.trimEnd();

            if (!isSendResponse && result !== undefined) {
                let resultStr;
                if (Buffer.isBuffer(result)) {
                    resultStr = `<Buffer ${result.length} bytes>`;
                } else if (typeof result === 'function') {
                    resultStr = `[Function: ${result.name || 'anonymous'}]`;
                } else if (typeof result === 'object') {
                    resultStr = util.inspect(result, {
                        depth: wantsRaw ? 5 : 3,
                        colors: false,
                        maxArrayLength: wantsRaw ? 50 : 20,
                        breakLength: wantsRaw ? 80 : 60,
                    });
                    if (resultStr.length > 8000) resultStr = resultStr.slice(0, 8000) + '\n... (truncated)';
                } else {
                    resultStr = String(result);
                }
                output = output ? output + '\n' + resultStr : resultStr;
            }

            if (output && output.trim() && output.trim() !== 'undefined') {
                const finalOutput = output.slice(0, 4000);
                await out(finalOutput);
            } else if (!consoleOutput && (result === undefined || isSendResponse)) {
                if (!isSendResponse) {
                    await bot.sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
                }
            }
        } catch (err) {
            console.log   = originalLog;
            console.error = originalError;
            console.warn  = originalWarn;

            let errMsg = err.message || String(err);
            if (consoleOutput) errMsg = consoleOutput.trimEnd() + '\n' + errMsg;
            await out(errMsg);
        }
    }
};
