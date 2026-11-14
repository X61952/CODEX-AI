'use strict';
// .sreact — react to a message with a STICKER (WhatsApp "sticker reaction").

const fs   = require('fs');
const path = require('path');

const DEFAULT_STICKER_MESSAGE = Object.freeze({
    url: 'https://mmg.whatsapp.net/o1/v/t24/f2/m232/AQPEoFVa7kEaTxJ5N4kBacoDZ1k0IzHqkfsmUhLxV8C4xB11yCktX6UEHvkJnmgTsnEhoRW27_Pma0f92oVnKzwBB4YUsMbtz2HlS_Oxeg?ccb=9-4&oh=01_Q5Aa5wEK3E2DIH-ZBY_naItwmTshYSHL2bClVxX2UUGd6_gOyw&oe=6B0DB1D3&_nc_sid=e6ed6c&mms3=true',
    fileSha256: 'BsnVlbXyY2a722AugpS5TLIuxPNmaHRU2Hi9vL90USY=',
    fileEncSha256: 'PQcd/lNPjIt/cbpv3UuTrnd5OH7O1GnASu0C3c+PdQg=',
    mediaKey: 'j6kvKJ0k1eha91lF+ruW+5TPGP5inpuCePSrFs0nhuI=',
    mimetype: 'image/webp',
    height: 64,
    width: 64,
    directPath: '/o1/v/t24/f2/m232/AQPEoFVa7kEaTxJ5N4kBacoDZ1k0IzHqkfsmUhLxV8C4xB11yCktX6UEHvkJnmgTsnEhoRW27_Pma0f92oVnKzwBB4YUsMbtz2HlS_Oxeg?ccb=9-4&oh=01_Q5Aa5wEK3E2DIH-ZBY_naItwmTshYSHL2bClVxX2UUGd6_gOyw&oe=6B0DB1D3&_nc_sid=e6ed6c',
    fileLength: '373112',
    mediaKeyTimestamp: '1793438486',
    firstFrameLength: 372742,
    firstFrameSidecar: 'z4sdmAKy5mcQPA==',
    isAnimated: true,
    isLottie: false,
    isAvatar: false,
    isAiSticker: false,
    premium: 0
});

const SREACT_FILE = path.join(__dirname, '../../database/sreact_sticker.json');
const MAX_STICKER_REACTION_ATTEMPTS = 10;
const STICKER_REACTION_DELAY_MS = 250;
const STICKER_FIELDS = ['stickerMessage', 'lottieStickerMessage'];

function parseReactionCount(value) {
    if (value === undefined || value === null || value === '') return 1;
    if (!/^[1-9]\d*$/.test(String(value))) return null;
    const count = Number(value);
    return Number.isSafeInteger(count) && count <= MAX_STICKER_REACTION_ATTEMPTS ? count : null;
}

function getQuotedStickerMessage(quoted) {
    if (!quoted) return null;
    for (const field of STICKER_FIELDS) {
        if (quoted.message?.[field]) return quoted.message[field];
        if (quoted[field]) return quoted[field];
    }
    if (STICKER_FIELDS.includes(quoted.mtype) && quoted.msg) return quoted.msg;
    return null;
}

function toPlain(value) {
    if (value === null || value === undefined) return value;
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value).toString('base64');
    if (Array.isArray(value)) return value.map(toPlain);
    if (typeof value === 'object') {
        if (value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data).toString('base64');
        if (typeof value.low === 'number' && typeof value.high === 'number') {
            return typeof value.toString === 'function' ? value.toString() : String(value.low);
        }
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
        return out;
    }
    return value;
}

function loadStickerReactionMessage() {
    try {
        if (!fs.existsSync(SREACT_FILE)) return DEFAULT_STICKER_MESSAGE;
        const saved = JSON.parse(fs.readFileSync(SREACT_FILE, 'utf8'));
        if (saved && typeof saved === 'object') {
            return saved.stickerMessage || saved.lottieStickerMessage || saved;
        }
    } catch (e) {
        console.error('[SREACT] Could not load saved sticker:', e.message);
    }
    return DEFAULT_STICKER_MESSAGE;
}

function saveStickerReactionMessage(quoted) {
    const sticker = getQuotedStickerMessage(quoted);
    if (!sticker) return false;
    fs.mkdirSync(path.dirname(SREACT_FILE), { recursive: true });
    fs.writeFileSync(SREACT_FILE, JSON.stringify(toPlain(sticker), null, 2));
    return true;
}

async function sendStickerReaction(sock, jid, parentMessageKey, count = 1) {
    const attempts = parseReactionCount(count);
    if (!attempts || !jid || !parentMessageKey?.id || typeof sock?.relayMessage !== 'function') return false;

    const stickerMessage = loadStickerReactionMessage();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        await sock.relayMessage(jid, {
            messageContextInfo: {
                messageAssociation: { associationType: 11, parentMessageKey }
            },
            stickerMessage: { ...stickerMessage }
        }, {});
        if (attempt + 1 < attempts) {
            await new Promise((resolve) => setTimeout(resolve, STICKER_REACTION_DELAY_MS));
        }
    }
    return true;
}

module.exports = {
    name: 'sreact',
    alias: ['stickerreact', 'sr'],
    desc: 'React to a replied message with the saved sticker reaction',
    category: 'owner',
    ownerOnly: true,

    execute: async (bot, m, args = []) => {
        const prefix = bot.prefix || '.';
        const first  = String(args[0] || '').toLowerCase();

        if (first === 'add' || first === 'set') {
            if (args.length !== 1) {
                return m.reply(`Reply to a sticker and send ${prefix}sreact add`);
            }
            if (!getQuotedStickerMessage(m.quoted)) {
                return m.reply(`Reply to a sticker with ${prefix}sreact add to set it as your sticker reaction`);
            }
            try {
                saveStickerReactionMessage(m.quoted);
            } catch (e) {
                return m.reply(`Could not save that sticker: ${e.message}`);
            }
            return m.reply('New sticker reaction saved');
        }

        const count = args.length <= 1 ? parseReactionCount(args[0]) : null;
        if (!count) {
            return m.reply(
                `Usage:\n` +
                `Reply to a message: ${prefix}sreact [1-${MAX_STICKER_REACTION_ATTEMPTS}]\n` +
                `Reply to a sticker: ${prefix}sreact add\n` +
                `On mentions: ${prefix}mention -sreact [count]`
            );
        }
        const targetKey = m.quoted?.key;
        if (!targetKey?.id) {
            return m.reply(`Reply to the message you want to react to, then send ${prefix}sreact [count]`);
        }

        if (getQuotedStickerMessage(m.quoted)) {
            try { saveStickerReactionMessage(m.quoted); } catch (e) {
                return m.reply(`Could not save that sticker: ${e.message}`);
            }
        }

        let sent = false;
        try {
            sent = await sendStickerReaction(bot.sock || bot, m.chat, targetKey, count);
        } catch (e) {
            console.error('[SREACT]', e.message);
        }
        if (!sent) return m.reply('Could not send the sticker reaction in this chat');
    },

    DEFAULT_STICKER_MESSAGE,
    SREACT_FILE,
    MAX_STICKER_REACTION_ATTEMPTS,
    parseReactionCount,
    getQuotedStickerMessage,
    loadStickerReactionMessage,
    saveStickerReactionMessage,
    sendStickerReaction,
};
