'use strict';

const { runDownload } = require('../../lib/socialdl');

module.exports = {
    name: 'tiktok',
    aliases: ['tt', 'tiktokdl', 'ttdl'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download a TikTok video without watermark (add "mp3" for audio only).',
    usage: '.tt <url> [mp3]',

    async execute(bot, m, args) {
        const prefix = bot.prefix || '.';
        return runDownload(bot, m, args, {
            platforms: ['tiktok'],
            noWatermark: true,
            usage:
                'Provide a valid TikTok URL!\n\n' +
                'Example:\n' +
                `${prefix}tt https://www.tiktok.com/@user/video/123456789\n` +
                `${prefix}tt https://vt.tiktok.com/ZSxxxxxx/ mp3\n\n` +
                'Or reply to a message with a TikTok link.',
        });
    },
};
