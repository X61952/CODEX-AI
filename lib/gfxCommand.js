'use strict';

const { STYLES, renderGfx } = require('./gfxStyles');
const { guard, cleanText, sendImage } = require('./imageKit');

const HINT = {
    two: '<small text>;<big text>',
    three: '<top text>;<big text>;<bottom text>',
    one: '<text>',
};
const EXAMPLE = {
    two: 'I Am;Codex',
    three: 'I Am;Codex AI;Developer',
    one: 'Codex AI',
};

/**
 * Builds the command object for gfx style `n`.
 *   two-text styles   .gfx2 I Am;Codex
 *   three-text styles .gfx5 I Am;Codex AI;Developer
 *   one-text styles   .gfx9 Codex AI
 */
function makeGfxCommand({ n, name, aliases = [] }) {
    const style = STYLES[n];
    if (!style) throw new Error(`Unknown gfx style ${n}`);

    return {
        name,
        aliases,
        category: 'image',
        reactions: { start: '⏳' },
        description: `Create a "${style.label}" gfx logo.`,
        usage: `.${name} ${HINT[style.mode]}`,

        async execute(bot, m, args) {
            const prefix = bot.prefix || '.';
            const usage = `*${style.label}*\nUsage: ${prefix}${name} ${HINT[style.mode]}\nExample: ${prefix}${name} ${EXAMPLE[style.mode]}`;

            return guard(m, async () => {
                const text = args.join(' ').trim();
                if (!text) return m.reply(usage);

                let parts;
                if (style.mode === 'one') {
                    parts = [cleanText(text.replace(/;/g, ' '), 26)];
                } else {
                    const pieces = text.split(';').map(p => cleanText(p, style.mode === 'three' ? 24 : 26)).filter(Boolean);
                    if (style.mode === 'two') {
                        if (!pieces.length) return m.reply(usage);
                        parts = pieces.length === 1 ? ['', pieces[0]] : [pieces[0], pieces[1]];
                    } else {
                        if (pieces.length < 3) return m.reply(`Please give three texts separated by semicolons.\n\n${usage}`);
                        parts = pieces.slice(0, 3);
                    }
                }

                await sendImage(bot, m, renderGfx(n, parts), { mimetype: 'image/png' });
            });
        },
    };
}

module.exports = { makeGfxCommand };
              
