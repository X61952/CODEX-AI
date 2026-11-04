'use strict';

const { runDownload } = require('../../lib/socialdl');

module.exports = {
    name: 'yturld',
    aliases: ['ytaudio'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download YouTube audio as MP3.',
    usage: '.yturld <url>',

    async execute(bot, m, args) {
        return runDownload(bot, m, args, {
            platforms: ['youtube'],
            audioOnly: true,
            usage: `Usage: ${bot.prefix}yturld <YouTube url>\nYou can also reply to a message that has a link.`,
        });
    },
};
