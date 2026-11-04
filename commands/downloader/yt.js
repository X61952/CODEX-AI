'use strict';

const { runDownload, MAX_VIDEO_SECONDS } = require('../../lib/socialdl');

module.exports = {
    name: 'yt',
    aliases: ['youtube', 'ytdl', 'youtubedownload'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download a YouTube video.',
    usage: '.yt <url> [720p|480p|best]',

    async execute(bot, m, args) {
        return runDownload(bot, m, args, {
            platforms: ['youtube'],
            maxSeconds: MAX_VIDEO_SECONDS,
            usage: `Usage: ${bot.prefix}yt <YouTube url> [720p|480p|best]\nYou can also reply to a message that has a link.`,
        });
    },
};
