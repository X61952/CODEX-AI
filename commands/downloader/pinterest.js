'use strict';

const { runDownload } = require('../../lib/socialdl');

module.exports = {
    name: 'pinterest',
    aliases: ['pint', 'pindl'],
    category: 'downloader',
    reactions: { start: '📥' },
    description: 'Download a Pinterest image or video.',
    usage: '.pinterest <link>',

    async execute(bot, m, args) {
        return runDownload(bot, m, args, {
            platforms: ['pinterest'],
            usage: `Usage: ${bot.prefix}pinterest <pin link>\nExample: ${bot.prefix}pinterest https://www.pinterest.com/pin/1234567890/`,
        });
    },
};
