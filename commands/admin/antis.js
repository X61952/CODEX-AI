const { buildPanel, applyPreset } = require('../../lib/antiSystems');

// Overview of every anti-system for this group. `.antis preset` applies the
// owner's recommended configuration (see PRESET_* in lib/antiSystems.js).
module.exports = {
    name: 'antis',
    aliases: ['antisystems', 'antilist', 'protection'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Show the status of every anti-system in this group (.antis preset applies the recommended setup)',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'preset' || sub === 'default' || sub === 'recommended') {
            applyPreset(m.chat);
            return await m.reply(`Recommended anti-system setup applied.\n\n${buildPanel(m.chat)}`);
        }
        return await m.reply(`*ANTI SYSTEMS*\n\n${buildPanel(m.chat)}\n\n${bot.prefix}antis preset — apply the recommended setup\nToggle any one with its own command, e.g. ${bot.prefix}antilink on`);
    },
};
