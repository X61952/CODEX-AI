'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'shortmax',
    name: 'shortmax',
    aliases: ['smax'],
    description: 'Download a ShortMax short-drama episode.',
});
