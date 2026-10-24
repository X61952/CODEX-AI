/**
 * .del — delete a message by replying to it. Owner / mod only.
 *
 *   Bot is a group ADMIN   → deletes the replied-to message AND your .del message.
 *   Bot is NOT an admin    → can only remove its OWN messages: it deletes the
 *                            replied-to message if the bot sent it, and leaves
 *                            your .del message alone (it can't delete yours).
 *                            If the replied-to message isn't the bot's, it says so
 *                            (in a DM it stays silent instead).
 */
const gt = require('../../lib/groupTools');

module.exports = {
    name: 'del',
    aliases: [],
    category: 'owner',
    ownerOnly: true,
    description: 'Reply to a message to delete it (bot admin: also removes your .del; not admin: only the bot\'s own messages)',

    async execute(bot, m) {
        const q = m.quoted;
        if (!q?.key?.id) return m.reply(`Reply to the message you want to delete.\nExample: reply to it with ${bot.prefix}del`);

        // Can the bot delete OTHER people's messages here? Only as a group admin.
        let botIsAdmin = false;
        if (m.isGroup) {
            try { botIsAdmin = !!(await bot.permission.isBotAdmin(m.chat)); } catch {}
        }

        // Was the replied-to message sent by the bot itself?
        const author = q.key.participant || '';
        let ownMessage = !!q.key.fromMe || (!!author && gt.isBot(bot, [author]));

        // In a DM there are only two people: the bot and you. A bot @lid/phone
        // mismatch can make the bot's own message look foreign, so if the quoted
        // author is NOT you (sender / chat), it must be the bot's message.
        if (!ownMessage && !m.isGroup) {
            const _d = j => String(j || '').replace(/:[0-9]+@/, '@').split('@')[0].replace(/[^0-9]/g, '');
            const mine = [m.sender, m._participantRaw, m.chat, m.key?.remoteJid, m.key?.remoteJidAlt, m.key?.participant]
                .filter(Boolean).map(_d).filter(Boolean);
            const authorD = _d(author);
            ownMessage = !!authorD && !mine.includes(authorD);
        }

        if (!botIsAdmin && !ownMessage) {
            // DM: replying to YOUR message with .del stays silent (the bot can't delete it).
            if (!m.isGroup) return;
            return m.reply("❌ I'm not an admin here, so I can only delete my own messages.");
        }

        // The message to delete — flagged fromMe when it's the bot's own so WhatsApp accepts the revoke.
        const targetKey = ownMessage
            ? { remoteJid: m.chat, id: q.key.id, fromMe: true, ...(m.isGroup && author ? { participant: author } : {}) }
            : { remoteJid: m.chat, id: q.key.id, fromMe: false, participant: author };

        try {
            await bot.sock.sendMessage(m.chat, { delete: targetKey });
        } catch (err) {
            return m.reply(`❌ Couldn't delete it: ${err.message}`);
        }

        // Bot is admin → also clear the .del command itself. Not admin → leave it (the bot can't remove it).
        if (botIsAdmin) {
            try { await bot.sock.sendMessage(m.chat, { delete: m.key }); } catch {}
        }
    },
};
