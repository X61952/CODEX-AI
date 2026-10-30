'use strict';

const engine = require('../../lib/ai/engine');
const media = require('../../lib/ai/media');
const { getContentType } = require('../../lib/baileys');

module.exports = {
    name: 'transcribe',
    aliases: ['voicetotext', 'vtt', 'speech'],
    category: 'group',
    description: 'Transcribe a replied-to voice message, audio or video (Groq Whisper)',
    usage: '.transcribe (reply to a voice note / audio / video)',

    async execute(bot, message) {
        const quotedMsg = (message?.msg?.contextInfo || message?.message?.extendedTextMessage?.contextInfo || {}).quotedMessage;
        if (!quotedMsg) return message.reply('Reply to a voice message, audio or video with .transcribe');

        const type = getContentType(quotedMsg);
        const content = quotedMsg[type];
        if (!['audioMessage', 'videoMessage'].includes(type)) {
            return message.reply('Please reply to a voice message, audio file or video.');
        }
        if (!engine.getKey(bot, 'groq') && !engine.getKey(bot, 'openai')) {
            return message.reply('⚠️ Voice transcription needs GROQ_API_KEY. Owner: check .aikeys');
        }

        await message.reply('🎧 Transcribing…');
        try {
            let buffer = await media.download(content, type === 'audioMessage' ? 'audio' : 'video');
            let mimetype = content.mimetype || 'audio/ogg';
            if (type === 'videoMessage') {
                buffer = await media.audioFromVideo(buffer);
                mimetype = 'audio/mpeg';
                if (!buffer) return message.reply("That video doesn't seem to have any sound.");
            }
            const r = await engine.transcribe({ bot, buffer, mimetype, toMp3: media.toMp3 });
            if (!r.ok) return message.reply("❌ I couldn't transcribe that. Try a clearer or shorter audio.");
            return message.reply(`📝 *Transcript*\n\n${r.text}`);
        } catch (error) {
            console.error('[transcribe]', error.message);
            return message.reply('❌ Transcription failed. Please try again with a shorter or clearer audio message.');
        }
    },
};
