const { canTag, sendGroupTag } = require('../../lib/groupTag');

// .all → tags everyone with the green group tag (like @all).
module.exports = {
    name: 'all',
    aliases: [],
    category: 'group',
    reactions: { start: '👥' },
    description: 'Tag everyone in the group like @all.',
    usage: '.all',
    groupOnly: true,

    async execute(bot, m) {
        try {
            if (!(await canTag(bot, m))) {
                return m.reply('❌ Only group admins, mods, or sudo users can use .all while the bot is private.');
            }
            await sendGroupTag(bot, m, 'all');
        } catch (error) {
            await m.reply(`❌ Failed to tag everyone: ${error.message}`);
        }
    },
};
          
