const { applyFancyFont, FANCY_FONT_COUNT } = require('../../lib/fontEngine');

module.exports = {
    name: 'botfont',
    aliases: ['fonts', 'fontlist'],
    category: 'bot',
    reactions: { start: '🎨' },
    description: 'List all available fancy text styles',

    async execute(bot, m) {
        const preview = 'CODEX AI';
        const styles = Array.from(
            { length: FANCY_FONT_COUNT },
            (_, index) => `${index + 1}. ${applyFancyFont(preview, index + 1)}`
        );
        await m.reply(styles.join('\n'), {}, { skipBotFont: true });
    }
};
