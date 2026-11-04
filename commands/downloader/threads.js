'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'threads',
    name: 'threads',
    aliases: ['threadsdl'],
    description: 'Download a Threads video or photo post.',
});
