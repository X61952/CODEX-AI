'use strict';

const { guard, getInputImage, sendImage } = require('../../lib/imageKit');
const fx = require('../../lib/imageFx');

module.exports = {
    name: 'invert',
    aliases: ['negative'],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Invert the colors of the replied user or picture.',
    usage: '.invert (reply to a user or a photo)',

    async execute(bot, m, args) {
        return guard(m, async () => {
            const { buffer } = await getInputImage(bot, m, args);
            await sendImage(bot, m, await fx.invert(buffer), { mimetype: 'image/jpeg' });
        });
    },
};
