'use strict';

const { guard, getInputImage, sendImage } = require('../../lib/imageKit');
const fx = require('../../lib/imageFx');

module.exports = {
    name: 'rip',
    aliases: ['rip-meme'],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Put the replied user or picture on a tombstone.',
    usage: '.rip (reply to a user or a photo)',

    async execute(bot, m, args) {
        return guard(m, async () => {
            const { buffer } = await getInputImage(bot, m, args);
            await sendImage(bot, m, await fx.rip(buffer), { mimetype: 'image/jpeg' });
        });
    },
};
