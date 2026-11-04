'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'spotify',
    name: 'spotify',
    aliases: ['sp', 'spdl'],
    description: 'Download a Spotify track as audio.',
});
