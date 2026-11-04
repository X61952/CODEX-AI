'use strict';

const { runDownload, MAX_VIDEO_SECONDS } = require('../../lib/socialdl');

module.exports = {
    name: 'ytmp4',
    aliases: ['ytvideo', 'ytv'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download a YouTube video (up to 10 min by default).',
    usage: '.ytmp4 <url> [720p|480p|best]',

    async execute(bot, m, args) {
        return runDownload(bot, m, args, {
            platforms: ['youtube'],
            maxSeconds: MAX_VIDEO_SECONDS,
            usage: `Usage: ${bot.prefix}ytmp4 <YouTube url> [720p|480p|best]\nYou can also reply to a message that has a link.`,
        });
    },
};
