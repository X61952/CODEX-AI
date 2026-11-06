'use strict';

const { guard, getInputImage, sendImage, CAPTION } = require('../../lib/imageKit');
const fx = require('../../lib/imageFx');

module.exports = {
    name: 'remini',
    aliases: ['upscale', 'hd'],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Enlarge and sharpen an image (scale 2-4).',
    usage: '.hd [2|3|4] (reply to an image)',

    async execute(bot, m, args) {
        return guard(m, async () => {
            const scaleArg = args.find(a => /^[234]$/.test(a));
            // Real images only, kept at (up to) 1600px so there is room to enlarge.
            const { buffer } = await getInputImage(bot, m, args, { requireImage: true, maxSide: 1600 });
            const out = await fx.upscale(buffer, scaleArg ? Number(scaleArg) : 2);
            await sendImage(bot, m, out.buffer, {
                mimetype: 'image/jpeg',
                caption: `*Upscaled ${out.scale}x* (${out.width}x${out.height})\n${CAPTION}`,
            });
        });
    },
};
