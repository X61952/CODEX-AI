'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'goodshort',
    name: 'goodshort',
    aliases: ['gshort'],
    description: 'Download a GoodShort short-drama episode.',
});
