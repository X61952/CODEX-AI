'use strict';

const G = require('../../lib/greetings');

const SLOT_ALIASES = {
    morning: 'morning', am: 'morning', m: 'morning',
    afternoon: 'afternoon', noon: 'afternoon', pm: 'afternoon', a: 'afternoon',
    night: 'night', n: 'night', evening: 'night',
};

module.exports = {
    name: 'gpreview',
    aliases: ['greetpreview', 'gprev'],
    category: 'owner',
    reactions: { start: '🔎' },
    description: 'Preview a greeting card with a random line (morning, afternoon or night).',
    usage: '.gpreview <morning|afternoon|night|all> [design number]',
    ownerOnly: true,

    async execute(bot, m, args) {
        const P = bot.prefix || '.';
        const first = String(args[0] || '').toLowerCase();

        if (!first || first === 'help' || first === 'list') {
            const list = G.SLOTS
                .map(slot => `${G.META[slot].emoji} *${G.META[slot].label}* (${G.LINES[slot].length} lines)\n${G.DESIGNS[slot].map((n, i) => `  ${i + 1}. ${n}`).join('\n')}`)
                .join('\n\n');
            return m.reply(
                `🔎 *Greeting preview*\n━━━━━━━━━━━━━━━━━━\n${list}\n━━━━━━━━━━━━━━━━━━\n` +
                `*${P}gpreview morning*  random design + random line\n` +
                `*${P}gpreview night 1*  design 1 + random line\n` +
                `*${P}gpreview all*  one of each`,
            );
        }

        const slots = first === 'all' ? G.SLOTS : [SLOT_ALIASES[first]];
        if (!slots[0]) return m.reply(`Choose: *morning*, *afternoon*, *night* or *all*.\nExample: ${P}gpreview morning`);

        let design;
        if (args[1] !== undefined && first !== 'all') {
            const n = Number(args[1]);
            const count = G.DESIGNS[slots[0]].length;
            if (!Number.isInteger(n) || n < 1 || n > count) return m.reply(`Design must be 1 to ${count}.\nExample: ${P}gpreview ${slots[0]} 1`);
            design = n - 1;
        }

        try {
            for (const slot of slots) {
                await G.sendGreeting(bot, slot, { jid: m.chat, quoted: m, random: true, preview: true, design });
            }
        } catch (err) {
            await m.reply(`⚠️ Could not build the preview: ${err.message}`);
        }
    },
};
