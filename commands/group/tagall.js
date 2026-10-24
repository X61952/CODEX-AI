module.exports = {
    name: 'tagall',
    aliases: ['tag', 'everyone'],
    category: 'group',
    reactions: { start: '👥' },
    description: 'Tag every member in the group.',
    usage: '.tagall [message]',
    groupOnly: true,

    async execute(bot, m, args) {
        try {
            const mode = String(bot.config?.mode || 'public').toLowerCase();
            const isAdmin = await bot.permission.isAdmin(m.chat, m.sender, m._participantRaw).catch(() => false);
            const isMod = bot.permission.isMod(m.sender, m._participantRaw);
            const isSudo = bot.permission.isSudo(m.sender, m._participantRaw);

            if (mode !== 'public' && !isAdmin && !isMod && !isSudo) {
                return m.reply('❌ Only group admins, mods, or sudo users can use .tagall while the bot is private.');
            }

            const metadata = await bot.sock.groupMetadata(m.chat);

            const messageArgs = String(args[0] || '').toLowerCase() === 'all'
                ? args.slice(1)
                : args;
            const message = messageArgs.join(' ').trim();
            const text = ['@all', message].filter(Boolean).join(' ');
            await bot.sock.sendMessage(m.chat, {
                text,
                contextInfo: {
                    groupMentions: [{
                        groupJid: m.chat,
                        groupSubject: metadata.subject || '',
                    }],
                },
            });
        } catch (error) {
            await m.reply(`❌ Failed to tag everyone: ${error.message}`);
        }
    },
};