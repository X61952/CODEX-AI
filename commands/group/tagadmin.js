module.exports = {
    name: 'tagadmin',
    aliases: ['admins'],
    category: 'group',
    reactions: { start: '🛡️' },
    description: 'Tag all group admins.',
    usage: '.tagadmin <message>',
    groupOnly: true,

    async execute(bot, m, args) {
        try {
            const meta = await bot.sock.groupMetadata(m.chat);
            const admins = meta.participants.filter(p => p.admin).map(p => p.id || p.jid || p.phoneNumber).filter(Boolean);
            const message = args.join(' ').trim() || 'Calling all admins';

            let text = `❴ 𝌆 *TAGADMIN* 𝌆 ❵\n*Message:* ${message}\n*Caller:* @${String(m.sender).split('@')[0]}\n\n`;
            
            meta.participants.filter(p => p.admin).forEach((p, i) => {
                const id = p.id || p.jid || p.phoneNumber;
                if (id) text += `⎔  ${i + 1}. @${String(id).split('@')[0]}\n`;
            });

            await bot.sock.sendMessage(m.chat, { text, mentions: [...new Set([m.sender, ...admins])] });
        } catch (err) {
            await m.reply(`Failed: ${err.message}`);
        }
    },
};
