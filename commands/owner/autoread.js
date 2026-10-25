const fs = require('fs-extra');

const MODES = { all: 'all chats', dm: 'DMs only', group: 'group chats only' };

module.exports = {
    name: 'autoread',
    aliases: ['ar'],
    category: 'owner',
    reactions: { start: '⚙️' },
    ownerOnly: true,
    description: 'Toggle auto-read (mark incoming messages as seen) and choose where it works',

    async execute(bot, m, args) {
        const sub = args[0]?.toLowerCase();
        const save = () => fs.writeFileSync('./config.json', JSON.stringify(bot.config, null, 2));
        const p = bot.prefix;
        const curMode = MODES[bot.config.autoReadMode] ? bot.config.autoReadMode : 'all';

        if (!sub) {
            const cur = bot.config.autoRead ? 'ON' : 'OFF';
            return await m.reply(
`x *AUTO READ*

x Current : ${cur}
x Mode    : ${MODES[curMode]}

x ${p}autoread on
x ${p}autoread off
x ${p}autoread mode dm
x ${p}autoread mode group
x ${p}autoread mode all`
            );
        }

        if (sub === 'on') {
            bot.config.autoRead = true;
            save();
            return await m.reply(`x Auto-read : *ON*\nx Works in : ${MODES[curMode]}`);
        }

        if (sub === 'off') {
            bot.config.autoRead = false;
            save();
            return await m.reply('x Auto-read : *OFF*');
        }

        if (sub === 'mode') {
            const want = args[1]?.toLowerCase();
            const mode = want === 'dm' || want === 'pm' || want === 'private' ? 'dm'
                : want === 'group' || want === 'gc' || want === 'groups' ? 'group'
                : want === 'all' ? 'all' : null;
            if (!mode) {
                return await m.reply(`x Usage:\nx ${p}autoread mode dm\nx ${p}autoread mode group\nx ${p}autoread mode all\n\nx Current mode : ${MODES[curMode]}`);
            }
            bot.config.autoReadMode = mode;
            bot.config.autoRead = true;   // choosing where to read means you want it on
            save();
            return await m.reply(`x Auto-read : *ON*\nx Mode : *${MODES[mode]}*`);
        }

        await m.reply(`x Usage: ${p}autoread on/off\nx ${p}autoread mode dm/group/all`);
    }
};
