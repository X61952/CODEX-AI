'use strict';

const { downloadMediaBuffer } = require('../../lib/mediaAnalyzer');
const smartAI = require('../../lib/smartAI');

module.exports = {
    name: 'transcribe',
    aliases: ['voicetotext', 'vtt', 'speech'],
    category: 'group',
    description: 'Transcribe a replied-to voice message or audio file',
    usage: '.transcribe (reply to audio)',

    async execute(bot, message) {
        const contextInfo = message?.msg?.contextInfo
            || message?.message?.extendedTextMessage?.contextInfo
            || {};
        const quoted = contextInfo.quotedMessage;
        if (!quoted) return message.reply('Reply to a voice message or audio file with .transcribe.');

        const audio = quoted.audioMessage;
        if (!audio) return message.reply('Please reply to a voice message or audio file.');

        const provider = String(bot.config?.AI_PROVIDER || 'groq').toLowerCase();
        const apiKey = bot.config?.AI_API_KEY
            || (provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GROQ_API_KEY);
        if (!apiKey) {
            return message.reply(`Configure an AI key first with .aiapi ${provider} <key>.`);
        }

        await message.reply('Transcribing audio...');

        try {
            const buffer = await downloadMediaBuffer(audio, 'audio');
            const transcript = await smartAI.transcribeAudio(bot, buffer, audio.mimetype || 'audio/ogg');
            if (!transcript) {
                return message.reply('I could not transcribe that audio. Check the API key, audio format, and provider limits.');
            }
            return message.reply(`*Transcript*\n${transcript}`);
        } catch (error) {
            console.error('[transcribe]', error.message);
            return message.reply('Transcription failed. Please try again with a shorter or clearer audio message.');
        }
    },
};
