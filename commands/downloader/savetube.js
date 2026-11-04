'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'savetube',
    name: 'savetube',
    aliases: ['stube'],
    description: 'Download a video from a SaveTube link.',
});
