/**
 * .restart — restarts the bot (the panel / process manager starts it again).
 * Owner only. Logic lives in lib/powerControl.js.
 */
const power = require('../../lib/powerControl');

module.exports = {
    name: 'restart',
    aliases: ['reboot'],
    category: 'owner',
    reactions: { start: '🔄' },
    ownerOnly: true,
    description: 'Restart the bot',

    async execute(bot, m) {
        if (!(m.key?.fromMe || bot.permission.isOwner(m.sender))) return m.reply('Owner only command');
        await m.reply('_𝌫 restarting bot..._');
        power.restart(bot, { chat: m.chat });
    },
};
