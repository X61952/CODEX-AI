'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'moboreels',
    name: 'moboreels',
    aliases: ['mobo'],
    description: 'Download a MoboReels short-drama episode.',
});
