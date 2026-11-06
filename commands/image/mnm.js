'use strict';

const { guard, getInputImage, sendImage } = require('../../lib/imageKit');
const fx = require('../../lib/imageFx');

module.exports = {
    name: 'mnm',
    aliases: [],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Turn the replied user or picture into an M&M candy mosaic.',
    usage: '.mnm (reply to a user or a photo)',

    async execute(bot, m, args) {
        return guard(m, async () => {
            const { buffer } = await getInputImage(bot, m, args);
            await sendImage(bot, m, await fx.mnm(buffer), { mimetype: 'image/jpeg' });
        });
    },
};
