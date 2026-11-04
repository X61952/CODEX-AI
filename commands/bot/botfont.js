const { applyFancyFont, FANCY_FONT_COUNT, FONT_NAMES } = require('../../lib/fontEngine');

module.exports = {
    name: 'botfont',
    aliases: ['fonts', 'fontlist'],
    category: 'bot',
    reactions: { start: '🎨' },
    description: 'List all available fancy text styles',

    async execute(bot, m, args) {
        const PREVIEW = 'CODEX-AI';
        let text = '';
        for (let i = 1; i <= FANCY_FONT_COUNT; i++) {
            text += `${i}. ${applyFancyFont(PREVIEW, i)} — ${FONT_NAMES[i - 1] || `style-${i}`}\n`;
        }
        await m.reply(text.trim(), {}, { skipBotFont: true });
    }
};
