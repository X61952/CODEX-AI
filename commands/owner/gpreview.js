'use strict';

const G = require('../../lib/greetings');

const SLOT_ALIASES = {
    morning: 'morning', am: 'morning', m: 'morning',
    afternoon: 'afternoon', noon: 'afternoon', pm: 'afternoon', a: 'afternoon',
    evening: 'evening', eve: 'evening', e: 'evening',
    night: 'night', n: 'night',
};

module.exports = {
    name: 'gpreview',
    aliases: ['greetpreview', 'gprev'],
    category: 'owner',
    reactions: { start: '🔎' },
    description: 'Preview a greeting card (morning, afternoon, evening or night). Works in DM and in groups.',
    usage: '.gpreview <morning|afternoon|evening|night|all> [line number]',
    ownerOnly: true,

    async execute(bot, m, args) {
        const P = bot.prefix || '.';
        const first = String(args[0] || '').toLowerCase();

        if (!first || first === 'help' || first === 'list') {
            const list = G.SLOTS
                .map(slot => `${G.META[slot].emoji} *${G.META[slot].label}*  ${G.slotLabelTime(G.readSettings(), slot)}  (${G.LINES[slot].length} lines)`)
                .join('\n');
            return m.reply(
                `🔎 *Greeting preview*\n━━━━━━━━━━━━━━━━━━\n${list}\n━━━━━━━━━━━━━━━━━━\n` +
                `*${P}gpreview morning*  random line\n` +
                `*${P}gpreview night 5*  line number 5\n` +
                `*${P}gpreview all*  one of each\n\n` +
                `_The preview is sent in the chat you use it in (DM or group). Real greetings are posted only in groups that have *${P}greetings on*._`,
            );
        }

        const slots = first === 'all' ? G.SLOTS : [SLOT_ALIASES[first]];
        if (!slots[0]) return m.reply(`Choose: *morning*, *afternoon*, *evening*, *night* or *all*.\nExample: ${P}gpreview evening`);

        let lineIndex;
        if (args[1] !== undefined && first !== 'all') {
            const n = Number(args[1]);
            const count = G.LINES[slots[0]].length;
            if (!Number.isInteger(n) || n < 1 || n > count) return m.reply(`Line must be 1 to ${count}.\nExample: ${P}gpreview ${slots[0]} 1`);
            lineIndex = n - 1;
        }

        try {
            for (const slot of slots) {
                await G.sendGreeting(bot, slot, m.chat, { quoted: m, random: true, preview: true, lineIndex });
            }
        } catch (err) {
            await m.reply(`⚠️ Could not build the preview: ${err.message}`);
        }
    },
};
                
