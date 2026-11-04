'use strict';

const { runDownload } = require('../../lib/socialdl');

module.exports = {
    name: 'capcut',
    aliases: ['capcutdl'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download a CapCut template video.',
    usage: '.capcut <template link>',

    async execute(bot, m, args) {
        return runDownload(bot, m, args, {
            platforms: ['capcut'],
            usage: `Please provide a valid CapCut URL.\nExample: ${bot.prefix}capcut https://www.capcut.com/template-detail/1234567890`,
        });
    },
};
