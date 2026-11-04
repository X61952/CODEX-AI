'use strict';

const { makePlatformCommand } = require('../../lib/socialdl');

module.exports = makePlatformCommand({
    platform: 'audiomack',
    name: 'audiomack',
    aliases: ['amack', 'audiomackdl'],
    description: 'Download an Audiomack track as audio.',
});
