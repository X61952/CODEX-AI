'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { applyFont, applyFancyFont, FANCY_FONT_COUNT, FONT_COUNT } = require('../lib/fontEngine');
const MessageHandler = require('../lib/messageHandler');
const fancyCommand = require('../commands/bot/fancy');
const botfontCommand = require('../commands/bot/botfont');

test('font registry has 81 distinct styles', () => {
    assert.equal(FANCY_FONT_COUNT, 81);
    assert.equal(FONT_COUNT, FANCY_FONT_COUNT);

    const samples = [
        'CODEX-AI codex 0123456789',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        'Hello, world! 123',
        '!@#$%^&*()_+-=[]{};:,.<>/?',
    ];
    const styles = new Map();

    for (let font = 1; font <= FANCY_FONT_COUNT; font++) {
        const output = samples.map(sample => applyFancyFont(sample, font)).join('\n');
        assert.ok(!styles.has(output), `Style ${font} duplicates style ${styles.get(output)}`);
        styles.set(output, font);
    }
});

test('.fancy bypasses the configured bot-wide font transformation', async () => {
    let reply;
    await fancyCommand.execute(
        { prefix: '.' },
        { reply: async (...args) => { reply = args; } },
        ['1', 'CODEX-AI']
    );

    assert.equal(reply[2].skipBotFont, true);
});

test('.botfont lists only numbered previews without applying BOT_FONT again', async () => {
    let reply;
    const preview = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    await botfontCommand.execute(
        { prefix: '.' },
        { reply: async (...args) => { reply = args; } },
        []
    );

    const lines = reply[0].split('\n');
    assert.equal(lines.length, FANCY_FONT_COUNT);
    const previews = lines.map((line, index) => {
        assert.ok(line.startsWith(`${index + 1}. `));
        return line.slice(`${index + 1}. `.length);
    });
    assert.equal(new Set(previews).size, FANCY_FONT_COUNT);
    assert.ok(reply[0].length < 65536);
    assert.equal(reply[2].skipBotFont, true);
});

test('BOT_FONT styles text inside menu frames without changing frame characters', () => {
    const output = applyFont('╔ MENU ╗\n║ USER: CODEX\n╚ END ╝', 1);
    assert.equal(output, '╔ ᴍᴇɴᴜ ╗\n║ ᴜꜱᴇʀ: ᴄᴏᴅᴇx\n╚ ᴇɴᴅ ╝');
});

test('command socket text sends use the same BOT_FONT pipeline', async () => {
    const rawSends = [];
    let formattedSendCount = 0;
    const bot = {
        config: { BOT_FONT: 1 },
        sock: {
            sendMessage: async (...args) => { rawSends.push(args); },
            groupMetadata() { return this; },
        },
        sendMessage: async (jid, content, options) => {
            formattedSendCount++;
            if (typeof content.text === 'string') content.text = applyFont(content.text, bot.config.BOT_FONT);
            return bot.sock.sendMessage(jid, content, options);
        },
    };
    const handler = Object.create(MessageHandler.prototype);
    handler.bot = bot;
    const commandContext = handler._commandContext();

    await commandContext.sock.sendMessage('chat', { text: 'BOT REPLY' }, { quoted: 'message' });
    await commandContext.sendMessage('chat', { text: 'BOT REPLY' }, { quoted: 'message' });

    assert.equal(formattedSendCount, 2);
    assert.deepEqual(rawSends, [
        ['chat', { text: 'ʙᴏᴛ ʀᴇᴘʟʏ' }, { quoted: 'message' }],
        ['chat', { text: 'ʙᴏᴛ ʀᴇᴘʟʏ' }, { quoted: 'message' }],
    ]);
    assert.equal(commandContext.sock.groupMetadata(), bot.sock);
});
