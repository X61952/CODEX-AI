const fs   = require('fs');
const path = require('path');

const MENTION_FILE = path.join(__dirname, '../../database/mention_config.json');
// The sticker the owner chose with `.mention -sticker` (raw .webp, sent as-is).
const STICKER_FILE = path.join(__dirname, '../../database/mention_sticker.webp');
// The audio the owner chose with `.mention -audio` (raw bytes, sent as-is).
const AUDIO_FILE = path.join(__dirname, '../../database/mention_audio.bin');

// IMPORTANT: Never reassign this object — always mutate it with Object.assign
// so that the exported reference in handler stays valid across reloads
const mentionConfig = {
    active: false,
    action: '',
    emoji:  '❤️‍🔥',
    text:   '',
    audioMime: 'audio/mpeg',   // mimetype of the saved audio
    audioPtt:  false           // true = send as a voice note
};

const loadMentionConfig = () => {
    try {
        if (fs.existsSync(MENTION_FILE)) {
            Object.assign(mentionConfig, JSON.parse(fs.readFileSync(MENTION_FILE, 'utf8')));
        }
    } catch (e) {
        console.error('[MENTION] Load error:', e.message);
    }
};

const saveMentionConfig = () => {
    try {
        fs.mkdirSync(path.dirname(MENTION_FILE), { recursive: true });
        fs.writeFileSync(MENTION_FILE, JSON.stringify(mentionConfig, null, 2));
    } catch (e) {
        console.error('[MENTION] Save error:', e.message);
    }
};

loadMentionConfig();

// Helper: normalize JID for comparison
const norm = (j) => (j || '').replace(/:\d+@/, '@').toLowerCase().trim();

module.exports = {
    name:      'mention',
    alias:     ['tagme', 'owntag'],
    desc:      'Set action when owner is mentioned in any chat',
    category: 'owner',
    reactions: { start: '⚙️' },
    ownerOnly: true,

    execute: async (sock, m, { args, reply, prefix }) => {
        const option = args[0]?.toLowerCase();
        const value  = args.slice(1).join(' ');

        // OFF
        if (option === 'off') {
            mentionConfig.active = false;
            mentionConfig.action = '';
            saveMentionConfig();
            return reply('╭─❍ *MENTION*\n│\n│ ✦ Status : OFF\n│ 𓄄 Action : disabled\n╰──────────────────');
        }

        // STATUS
        if (option === 'status' || option === '-status') {
            return reply(
                `╭─❍ *MENTION STATUS*\n│\n` +
                `│ ⚉ Active : ${mentionConfig.active ? '✓ ON' : '✗ OFF'}\n` +
                `│ 𓄄 Action : ${mentionConfig.action || 'None'}\n` +
                `│ ✦ Emoji  : ${mentionConfig.emoji  || '-'}\n` +
                `│ ❏ Text   : ${mentionConfig.text   || '-'}\n` +
                `│ ✧ Sticker: ${fs.existsSync(STICKER_FILE) ? 'saved' : '-'}\n` +
                `│ ♫ Audio  : ${fs.existsSync(AUDIO_FILE) ? 'saved' : '-'}\n` +
                `╰──────────────────`
            );
        }

        // REACT: `.mention -react` enables the current/default emoji;
        // `.mention -react on` enables it; `.mention -react <emoji>` sets it.
        if (option === 'react' || option === '-react') {
            const reactValue = args.slice(1).join(' ').trim();
            if (reactValue.toLowerCase() === 'off') {
                mentionConfig.active = false;
                mentionConfig.action = '';
                saveMentionConfig();
                return reply('╭─❍ *MENTION-REACT*\n│\n│ ✦ Status : OFF\n╰──────────────────');
            }
            if (reactValue.toLowerCase() === 'on' || !reactValue) {
                mentionConfig.active = true;
                mentionConfig.action = 'react';
                mentionConfig.emoji = mentionConfig.emoji || '💚';
            } else {
                mentionConfig.active = true;
                mentionConfig.action = 'react';
                mentionConfig.emoji = reactValue;
            }
            mentionConfig.text   = '';
            saveMentionConfig();
            return reply(`╭─❍ *MENTION*\n│\n│ ✦ Status : ON\n│ 𓄄 Action : REACT\n│ ⚉ Emoji  : ${mentionConfig.emoji}\n╰──────────────────`);
        }

        // STICKER: reply to the sticker you want with `.mention -sticker`.
        // `.mention -sticker off` disables it; `.mention -sticker on` re-enables
        // the sticker already saved.
        if (option === 'sticker' || option === '-sticker') {
            const sub = (args[1] || '').toLowerCase();
            if (sub === 'off') {
                mentionConfig.active = false;
                mentionConfig.action = '';
                saveMentionConfig();
                return reply('╭─❍ *MENTION-STICKER*\n│\n│ ✦ Status : OFF\n╰──────────────────');
            }
            const ctx = m.contextInfo || m.msg?.contextInfo || m.message?.extendedTextMessage?.contextInfo || {};
            const quotedSticker = ctx.quotedMessage?.stickerMessage;
            if (!quotedSticker) {
                if (sub === 'on' && fs.existsSync(STICKER_FILE)) {
                    mentionConfig.active = true;
                    mentionConfig.action = 'sticker';
                    mentionConfig.text = '';
                    saveMentionConfig();
                    return reply('╭─❍ *MENTION-STICKER*\n│\n│ ✦ Status : ON\n│ 𓄄 Using your saved sticker\n╰──────────────────');
                }
                return reply(`╭─❍ *MENTION-STICKER*\n│\n│ ✘ Reply to a sticker with ${prefix}mention -sticker\n│ ⚉ That sticker will be sent whenever you are mentioned\n╰──────────────────`);
            }
            try {
                const { downloadMediaMessage } = require('../../lib/baileys');   // lazy: keeps mention-react/-text loading independent of Baileys
                const buffer = await downloadMediaMessage({
                    key: {
                        remoteJid: m.chat || m.key?.remoteJid,
                        id: ctx.stanzaId,
                        fromMe: false,
                        participant: ctx.participant,
                    },
                    message: ctx.quotedMessage,
                }, 'buffer', {});
                if (!buffer || !buffer.length) throw new Error('empty download');
                fs.mkdirSync(path.dirname(STICKER_FILE), { recursive: true });
                fs.writeFileSync(STICKER_FILE, buffer);
            } catch (e) {
                console.error('[MENTION] Sticker save error:', e.message);
                return reply('╭─❍ *MENTION-STICKER*\n│\n│ ✘ Could not save that sticker. Try replying to it again.\n╰──────────────────');
            }
            mentionConfig.active = true;
            mentionConfig.action = 'sticker';
            mentionConfig.emoji  = '';
            mentionConfig.text   = '';
            saveMentionConfig();
            return reply('╭─❍ *MENTION-STICKER*\n│\n│ ✦ Status : ON\n│ 𓄄 Action : STICKER\n│ ✧ Sticker saved\n╰──────────────────');
        }

        // AUDIO: reply to an audio / voice note with `.mention -audio`.
        // `.mention -audio off` disables it; `.mention -audio on` re-enables
        // the audio already saved.
        if (option === 'audio' || option === '-audio') {
            const sub = (args[1] || '').toLowerCase();
            if (sub === 'off') {
                mentionConfig.active = false;
                mentionConfig.action = '';
                saveMentionConfig();
                return reply('╭─❍ *MENTION-AUDIO*\n│\n│ ✦ Status : OFF\n╰──────────────────');
            }
            const ctx = m.contextInfo || m.msg?.contextInfo || m.message?.extendedTextMessage?.contextInfo || {};
            const quotedAudio = ctx.quotedMessage?.audioMessage;
            if (!quotedAudio) {
                if (sub === 'on' && fs.existsSync(AUDIO_FILE)) {
                    mentionConfig.active = true;
                    mentionConfig.action = 'audio';
                    mentionConfig.text = '';
                    saveMentionConfig();
                    return reply('╭─❍ *MENTION-AUDIO*\n│\n│ ✦ Status : ON\n│ 𓄄 Using your saved audio\n╰──────────────────');
                }
                return reply(`╭─❍ *MENTION-AUDIO*\n│\n│ ✘ Reply to an audio with ${prefix}mention -audio\n│ ⚉ That audio will be sent whenever you are mentioned\n╰──────────────────`);
            }
            try {
                const { downloadMediaMessage } = require('../../lib/baileys');   // lazy: keeps the other mention modes independent of Baileys
                const buffer = await downloadMediaMessage({
                    key: {
                        remoteJid: m.chat || m.key?.remoteJid,
                        id: ctx.stanzaId,
                        fromMe: false,
                        participant: ctx.participant,
                    },
                    message: ctx.quotedMessage,
                }, 'buffer', {});
                if (!buffer || !buffer.length) throw new Error('empty download');
                fs.mkdirSync(path.dirname(AUDIO_FILE), { recursive: true });
                fs.writeFileSync(AUDIO_FILE, buffer);
            } catch (e) {
                console.error('[MENTION] Audio save error:', e.message);
                return reply('╭─❍ *MENTION-AUDIO*\n│\n│ ✘ Could not save that audio. Try replying to it again.\n╰──────────────────');
            }
            mentionConfig.active    = true;
            mentionConfig.action    = 'audio';
            mentionConfig.audioMime = quotedAudio.mimetype || (quotedAudio.ptt ? 'audio/ogg; codecs=opus' : 'audio/mpeg');
            mentionConfig.audioPtt  = !!quotedAudio.ptt;
            mentionConfig.emoji     = '';
            mentionConfig.text      = '';
            saveMentionConfig();
            return reply('╭─❍ *MENTION-AUDIO*\n│\n│ ✦ Status : ON\n│ 𓄄 Action : AUDIO\n│ ♫ Audio saved\n╰──────────────────');
        }

        // TEXT
        if (option === 'text' || option === '-text') {
            if (!value) {
                return reply('╭─❍ *MENTION*\n│\n│ ✘ Provide text\n│ ⚉ Example: .mention -text Busy, back later\n╰──────────────────');
            }
            mentionConfig.active = true;
            mentionConfig.action = 'text';
            mentionConfig.text   = value;
            mentionConfig.emoji  = '';
            saveMentionConfig();
            return reply(`╭─❍ *MENTION*\n│\n│ ✦ Status : ON\n│ 𓄄 Action : TEXT\n│ ⚉ Text   : ${value.slice(0, 30)}${value.length > 30 ? '...' : ''}\n╰──────────────────`);
        }

        // HELP
        return reply(
            `╭─❍ *MENTION CONFIGURATION*\n│\n` +
            `│ Configure auto-response when owner is mentioned.\n│\n` +
            `│ ⚉ *Commands:*\n│\n` +
            `│ ➫ ${prefix}mention off\n` +
            `│   Disable mention responses\n│\n` +
            `│ ➫ ${prefix}mention -status\n` +
            `│   Show current configuration\n│\n` +
            `│ ➫ ${prefix}mention -react\n` +
            `│   Enable with the current emoji\n│\n` +
            `│ ➫ ${prefix}mention -react on/off\n` +
            `│   Toggle mention reactions\n│\n` +
            `│ ➫ ${prefix}mention -react <emoji>\n` +
            `│   Set emoji and enable\n` +
            `│   Example: ${prefix}mention -react 💚\n│\n` +
            `│ ➫ ${prefix}mention -sticker\n` +
            `│   Reply to a sticker: it is sent when you are mentioned\n` +
            `│   (${prefix}mention -sticker off to disable)\n│\n` +
            `│ ➫ ${prefix}mention -audio\n` +
            `│   Reply to an audio: it is sent when you are mentioned\n` +
            `│   (${prefix}mention -audio off to disable)\n│\n` +
            `│ ➫ ${prefix}mention -text <message>\n` +
            `│   Auto-reply when mentioned\n` +
            `│   Example: ${prefix}mention -text Busy, back later\n│\n` +
            `╰──────────────────`
        );
    }
};

module.exports.mentionConfig     = mentionConfig;
module.exports.loadMentionConfig = loadMentionConfig;
module.exports.norm = norm;
module.exports.STICKER_FILE = STICKER_FILE;
module.exports.AUDIO_FILE = AUDIO_FILE;

