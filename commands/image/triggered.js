'use strict';

const { guard, getInputImage, sendImage, CAPTION } = require('../../lib/imageKit');
const fx = require('../../lib/imageFx');

module.exports = {
    name: 'triggered',
    aliases: ['trigger', 'trigger-meme'],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Create an animated TRIGGERED meme of the replied user or picture.',
    usage: '.triggered (reply to a user or a photo)',

    async execute(bot, m, args) {
        return guard(m, async () => {
            const { buffer } = await getInputImage(bot, m, args);
            const { video, still } = await fx.triggered(buffer);
            if (video) {
                await bot.sock.sendMessage(m.chat, {
                    video,
                    mimetype: 'video/mp4',
                    gifPlayback: true,
                    caption: CAPTION,
                }, { quoted: m });
            } else {
                await sendImage(bot, m, still, { mimetype: 'image/jpeg' });
            }
        });
    },
};
