'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'flickreels',
    name: 'flickreels',
    aliases: ['flick'],
    description: 'Download a FlickReels short-drama episode.',
});
