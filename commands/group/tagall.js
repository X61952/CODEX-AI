const { canTag, quotedText, participantIds } = require('../../lib/groupTag');

// .tagall [message]  → lists every member (numbered) and notifies them all.
// A message can be typed after the command or taken from the message you reply to.
module.exports = {
    name: 'tagall',
    aliases: ['tag'],
    category: 'group',
    reactions: { start: '👥' },
    description: 'List and tag every member in the group.',
    usage: '.tagall [message]  (or reply to a message)',
    groupOnly: true,

    async execute(bot, m, args) {
        try {
            if (!(await canTag(bot, m))) {
                return m.reply('❌ Only group admins, mods, or sudo users can use .tagall while the bot is private.');
            }

            const { metadata, ids } = await participantIds(bot, m.chat);
            const message = (args || []).join(' ').trim() || quotedText(m);

            let text = `❴ 𝌆 *TAGALL* 𝌆 ❵\n*Message:* ${message || 'blank'}\n*Caller:* @${String(m.sender).split('@')[0]}\n\n`;
            (metadata.participants || []).forEach((p, i) => {
                const id = p.id || p.jid || p.phoneNumber;
                if (id) text += `
⎔ ${i + 1}. @${String(id).split('@')[0]}\n`;
            });

            await bot.sock.sendMessage(m.chat, { text, mentions: [...new Set([m.sender, ...ids])] });
        } catch (error) {
            await m.reply(`❌ Failed to tag everyone: ${error.message}`);
        }
    },
};
