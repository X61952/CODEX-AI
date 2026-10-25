const { canTag, quotedText, sendGroupTag } = require('../../lib/groupTag');

// .everyone hi            → "hi" shown as the green group tag, everyone notified.
// reply + .everyone       → the replied message's text is shown as the green tag.
module.exports = {
    name: 'everyone',
    aliases: [],
    category: 'group',
    reactions: { start: '👥' },
    description: 'Tag everyone with your own word or the message you reply to.',
    usage: '.everyone <text>  (or reply to a message)',
    groupOnly: true,

    async execute(bot, m, args) {
        try {
            if (!(await canTag(bot, m))) {
                return m.reply('❌ Only group admins, mods, or sudo users can use .everyone while the bot is private.');
            }
            const text = (args || []).join(' ').trim() || quotedText(m);
            if (!text) return m.reply('Provide a message for the tag, or reply to a text message.\nExample: .everyone hi');
            await sendGroupTag(bot, m, text);
        } catch (error) {
            await m.reply(`❌ Failed to tag everyone: ${error.message}`);
        }
    },
};
