'use strict';

const { runDownload, PLATFORMS } = require('../../lib/socialdl');

module.exports = {
    name: 'dl',
    aliases: ['download', 'sdl', 'social', 'getmedia'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download from any supported platform: YouTube, TikTok, Facebook, Instagram, Twitter/X, Pinterest, CapCut.',
    usage: '.dl <link> [mp3] [720p|480p|best]',

    async execute(bot, m, args) {
        const list = Object.values(PLATFORMS).map(p => `• ${p.label}`).join('\n');
        return runDownload(bot, m, args, {
            usage:
                `*Universal downloader*\n\n` +
                `Usage: ${bot.prefix}dl <link> [mp3] [720p|480p|best]\n` +
                `You can also reply to a message that has a link.\n\n` +
                `Supported:\n${list}`,
        });
    },
};
