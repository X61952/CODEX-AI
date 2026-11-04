'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'dramafren',
    name: 'dramafren',
    aliases: ['dfren'],
    description: 'Download a DramaFren short-drama episode.',
});
