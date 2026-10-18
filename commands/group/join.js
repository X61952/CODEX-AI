module.exports = {
    name: 'join',
    aliases: ['joingc'],
    category: 'group',
    reactions: { start: '⚙️' },
    description: 'Join a group via invite link.',
    usage: '.join <link>',
    ownerOnly: true,

    async execute(bot, m, args) {
        const raw = args.join(' ').trim()
            || m.msg?.contextInfo?.quotedMessage?.conversation
            || m.msg?.contextInfo?.quotedMessage?.extendedTextMessage?.text
            || '';

        const match = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
        if (!match) return m.reply(`Usage: ${bot.prefix}join https://chat.whatsapp.com/XXXX`);

        try {
            const groupId = await bot.sock.groupAcceptInvite(match[1]);
            // The owner joined on purpose — plugins/autoleave.js must not
            // treat this as "someone added the bot".
            if (groupId) {
                bot._joinedByCommand = bot._joinedByCommand || new Map();
                bot._joinedByCommand.set(groupId, Date.now());
            }
            let name = groupId;
            try {
                const meta = await bot.sock.groupMetadata(groupId);
                name = meta.subject || groupId;
            } catch {}
            await m.reply(`Joined "${name}".`);
        } catch (err) {
            await m.reply(`Failed to join: ${err.message}`);
        }
    },
};
