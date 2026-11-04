'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'dramabox',
    name: 'dramabox',
    aliases: ['dramaboxdl'],
    description: 'Download a DramaBox short-drama episode.',
});
