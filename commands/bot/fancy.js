const { applyFancyFont, FANCY_FONT_COUNT } = require('../../lib/fontEngine');

module.exports = {
    name: 'fancy',
    aliases: ['fancytext', 'ft'],
    category: 'bot',
    reactions: { start: '🎨' },
    description: 'Generate fancy text in a chosen font style',

    async execute(bot, m, args) {
        if (args.length < 2) return await m.reply(
`Usage: ${bot.prefix}fancy <number> <text>
Example: ${bot.prefix}fancy 1 CODEX-AI
Styles: ${FANCY_FONT_COUNT}
List: ${bot.prefix}botfont`);

        const num  = parseInt(args[0]);
        const text = args.slice(1).join(' ');

        if (isNaN(num) || num < 1 || num > FANCY_FONT_COUNT) {
            return await m.reply(`Font number must be 1-${FANCY_FONT_COUNT}.\nSee all styles: ${bot.prefix}botfont`);
        }

        const result = applyFancyFont(text, num);
        await m.reply(`${result}`, {}, { skipBotFont: true });
    }
};
