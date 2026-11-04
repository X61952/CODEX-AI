'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'rednote',
    name: 'rednote',
    aliases: ['xhs', 'xiaohongshu', 'rednotedl'],
    description: 'Download a RedNote (Xiaohongshu) video or photo post.',
});
