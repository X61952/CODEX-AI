'use strict';

const { guard, getInputImage, sendImage } = require('../../lib/imageKit');
const fx = require('../../lib/imageFx');

module.exports = {
    name: 'rainbow',
    aliases: [],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Apply a rainbow filter to the replied user or picture.',
    usage: '.rainbow (reply to a user or a photo)',

    async execute(bot, m, args) {
        return guard(m, async () => {
            const { buffer } = await getInputImage(bot, m, args);
            await sendImage(bot, m, await fx.rainbow(buffer), { mimetype: 'image/jpeg' });
        });
    },
};
