'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'reelshort',
    name: 'reelshort',
    aliases: ['rshort'],
    description: 'Download a ReelShort short-drama episode.',
});
