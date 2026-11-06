'use strict';

const { guard, getInputImage, sendImage } = require('../../lib/imageKit');
const fx = require('../../lib/imageFx');

module.exports = {
    name: 'wasted',
    aliases: ['gtawasted', 'dead'],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Add the GTA "WASTED" death screen to the replied user or picture.',
    usage: '.wasted (reply to a user or a photo)',

    async execute(bot, m, args) {
        return guard(m, async () => {
            const { buffer } = await getInputImage(bot, m, args);
            await sendImage(bot, m, await fx.wasted(buffer), { mimetype: 'image/jpeg' });
        });
    },
};
