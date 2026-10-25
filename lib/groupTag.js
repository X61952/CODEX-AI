// Shared helpers for the group tag commands (.tagall / .all / .everyone).

// Admins/mods/sudo only while the bot is private; everyone in public mode.
async function canTag(bot, m) {
    const mode = String(bot.config?.mode || 'public').toLowerCase();
    if (mode === 'public') return true;
    const isAdmin = await bot.permission.isAdmin(m.chat, m.sender, m._participantRaw).catch(() => false);
    const isMod = bot.permission.isMod(m.sender, m._participantRaw);
    const isSudo = bot.permission.isSudo(m.sender, m._participantRaw);
    return !!(isAdmin || isMod || isSudo);
}

// Text of the message that was replied to (plain text, caption, or extended text).
function quotedText(m) {
    const q = m.quoted;
    if (!q) return '';
    if (typeof q.msg === 'string') return q.msg.trim();
    return String(
        q.text ||
        q.message?.conversation ||
        q.message?.extendedTextMessage?.text ||
        q.caption || ''
    ).trim();
}

async function participantIds(bot, jid) {
    const metadata = await bot.sock.groupMetadata(jid);
    return {
        metadata,
        ids: (metadata.participants || []).map(p => p.id || p.jid || p.phoneNumber).filter(Boolean),
    };
}

// The green group tag: the body is the group's own tag and `subject` is the word
// WhatsApp shows in green. Every member is notified without their names showing.
async function sendGroupTag(bot, m, subject) {
    const { ids } = await participantIds(bot, m.chat);
    return bot.sock.sendMessage(m.chat, {
        text: '@' + m.chat,
        contextInfo: {
            mentionedJid: ids,
            groupMentions: [{ groupJid: m.chat, groupSubject: subject }],
        },
    });
}

module.exports = { canTag, quotedText, participantIds, sendGroupTag };
                                                                                           
