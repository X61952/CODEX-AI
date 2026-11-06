'use strict';

const { guard, rawArgText, quotedText, sendImage } = require('../../lib/imageKit');
const fx = require('../../lib/imageFx');

module.exports = {
    name: 'carbon',
    aliases: ['code', 'codeimg'],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Turn code into a syntax-highlighted screenshot.',
    usage: '.carbon <code> (or reply to a message with code)',

    async execute(bot, m) {
        return guard(m, async () => {
            // The replied message wins; otherwise the text after the command (line breaks kept).
            const code = quotedText(m).trim() || rawArgText(m).trim();
            if (!code) {
                return m.reply(`Provide code or reply to a message with code.\nExample: ${bot.prefix || '.'}carbon console.log("Hello World")`);
            }
            await sendImage(bot, m, fx.carbon(code), { mimetype: 'image/png' });
        });
    },
};
