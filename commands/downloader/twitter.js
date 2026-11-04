'use strict';

const { runDownload } = require('../../lib/socialdl');

module.exports = {
    name: 'twitter',
    aliases: ['xdl', 'twdl', 'tw'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download Twitter/X videos and images.',
    usage: '.tw <tweet url>',

    async execute(bot, m, args) {
        return runDownload(bot, m, args, {
            platforms: ['twitter'],
            usage: `Please provide a valid Twitter/X URL.\nExample: ${bot.prefix}tw https://x.com/user/status/123`,
        });
    },
};
