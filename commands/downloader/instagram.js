'use strict';

const { runDownload } = require('../../lib/socialdl');

module.exports = {
    name: 'instagram',
    aliases: ['ig', 'insta', 'igdl', 'reel'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download an Instagram reel, video or post (add "mp3" for audio only).',
    usage: '.ig <url> [mp3]',

    async execute(bot, m, args) {
        return runDownload(bot, m, args, {
            platforms: ['instagram'],
            usage:
                `Usage: ${bot.prefix}ig <Instagram link>\n` +
                `Example: ${bot.prefix}ig https://www.instagram.com/reel/CODE/\n\n` +
                'Private posts need a cookies file (SOCIAL_DL_COOKIES).',
        });
    },
};
