'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'anydrama',
    name: 'anydrama',
    aliases: ['adrama'],
    description: 'Download a short-drama episode from any AnyDrama catalog page.',
});
