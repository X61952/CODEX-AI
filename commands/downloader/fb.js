'use strict';

const { runDownload } = require('../../lib/socialdl');

module.exports = {
    name: 'fb',
    aliases: ['facebook', 'fbdown'],
    category: 'downloader',
    reactions: { start: '⚙️' },
    description: 'Download a Facebook video or reel.',
    usage: '.fb <Facebook URL> (or reply to a message containing one)',

    async execute(bot, m, args) {
        return runDownload(bot, m, args, {
            platforms: ['facebook'],
            usage: `Usage: ${bot.prefix}fb <Facebook URL> (or reply to a message with one)`,
        });
    },
};
