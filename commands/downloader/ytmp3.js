'use strict';

const { runDownload } = require('../../lib/socialdl');

module.exports = {
    name: 'ytmp3',
    aliases: ['ytvid-audio', 'ytaudio2'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download YouTube audio as MP3 by URL.',
    usage: '.ytmp3 <url>',

    async execute(bot, m, args) {
        return runDownload(bot, m, args, {
            platforms: ['youtube'],
            audioOnly: true,
            usage: `Usage: ${bot.prefix}ytmp3 <YouTube url>\nYou can also reply to a message that has a link.`,
        });
    },
};
