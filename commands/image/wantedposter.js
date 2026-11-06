'use strict';

const { guard, getInputImage, sendImage } = require('../../lib/imageKit');
const fx = require('../../lib/imageFx');

module.exports = {
    name: 'wantedposter',
    aliases: ['wantedpic', 'wantedpost'],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Make a wanted poster of the replied user or picture.',
    usage: '.wantedposter (reply to a user or a photo)',

    async execute(bot, m, args) {
        return guard(m, async () => {
            const { buffer } = await getInputImage(bot, m, args);
            await sendImage(bot, m, await fx.wantedPoster(buffer), { mimetype: 'image/jpeg' });
        });
    },
};
