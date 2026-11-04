'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'flextv',
    name: 'flextv',
    aliases: ['flex'],
    description: 'Download a FlexTV short-drama episode.',
});
