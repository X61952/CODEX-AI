module.exports = {
    name: 'owner',
    aliases: ['creator'],
    category: 'general',
    reactions: { start: '🔐' },
    description: 'Show bot owner contact as vCard',

    async execute(bot, m, args) {
        const owner  = bot.config.owner;
        const number = owner.number.replace('@s.whatsapp.net', '');
        const name   = owner.name || 'Owner';

        const vcard =
`BEGIN:VCARD
VERSION:3.0
FN:${name}
ORG:${bot.config.botName};
TEL;type=CELL;type=VOICE;waid=${number}:+${number}
END:VCARD`;

        await bot.sock.sendMessage(m.chat, {
            contacts: {
                displayName: name,
                contacts: [{ vcard }]
            }
        });
    }
};
