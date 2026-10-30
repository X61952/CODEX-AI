const fs = require('fs-extra');

module.exports = {
    name: 'mode',
    aliases: ['botmode'],
    category: 'owner',
    reactions: { start: '⚙️' },
    ownerOnly: true,
    description: 'Switch bot between public and private mode',

    async execute(bot, m, args) {
        const val = args[0]?.toLowerCase();

        // .mode dm | group | tag | all  → CODEX AI chatbot mode (see .chatbot)
        if (val && ['dm', 'group', 'groups', 'tag', 'all', 'both'].includes(val)) {
            const store = require('../../lib/ai/store');
            const modes = store.parseModes(args);
            if (!modes || !modes.length) return await m.reply(`Usage: ${bot.prefix}mode dm | group | tag | all`);
            store.update((d) => { d.modes = modes; });
            const on = store.get().enabled;
            return await m.reply(`✅ Chatbot mode set to *${modes.map((x) => x.toUpperCase()).join(' + ')}*.${on ? '' : `\n_(Chatbot is still OFF — turn it on with ${bot.prefix}chatbot on)_`}`);
        }

        if (!val || !['public', 'private'].includes(val)) {
            const cur = (bot.config.mode || 'public').toUpperCase();
            return await m.reply(
`x *MODE*

x Current : ${cur}

x Usage:
  ${bot.prefix}mode public   — everyone can use the bot (GC, DM, bot DM)
  ${bot.prefix}mode private  — only owner / mods / sudo (in GC, DM, bot DM)\n\nx Chatbot modes:\n  ${bot.prefix}mode dm | group | tag | all  (see ${bot.prefix}chatbot)`
            );
        }

        bot.config.mode = val;
        fs.writeFileSync('./config.json', JSON.stringify(bot.config, null, 2));

        await m.reply(val === 'public'
            ? 'x Mode set to *PUBLIC*.\nx Everyone can now use the bot in groups, DMs and the bot DM.'
            : 'x Mode set to *PRIVATE*.\nx Only owner, mods and sudo can use the bot (groups, DMs and the bot DM).'
        );
    }
};
