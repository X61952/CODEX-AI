'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'applemusic',
    name: 'applemusic',
    aliases: ['apple', 'amusic', 'applemusicdl'],
    description: 'Download an Apple Music track as audio.',
});
