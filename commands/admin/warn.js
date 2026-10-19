const tz = require('../../lib/timezone');
const fs = require('fs-extra');
const { getTarget } = require('../../lib/getTarget');
const { getQuoted } = require('../../lib/getQuoted');

const WARN_PATH  = './database/warnings.json';
const MAX_WARNS  = 3; // hard cap — matches every anti-system's warn[1-3] limit

function loadDB() {
    try { return JSON.parse(fs.readFileSync(WARN_PATH, 'utf8')); } catch { return {}; }
}
function saveDB(db) {
    fs.ensureDirSync('./database');
    fs.writeFileSync(WARN_PATH, JSON.stringify(db, null, 2));
}
function nigerianTime() {
    return new Date().toLocaleString('en-NG', {
        timeZone: tz.get(),
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
}

module.exports = {
    name: 'warn',
    aliases: ['w'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Warn a user. Tag or reply to their message. .warn @user <reason>',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const target = getTarget(m);
        if (!target) return await m.reply(`Tag a user or reply to their message.\nExample: ${bot.prefix}warn @user spamming links`);

        if (target === m.sender.replace(/:[0-9]+@/, '@')) {
            return await m.reply('❌ You cannot warn yourself.');
        }

        // BUG (found): nothing stopped an admin (accidentally or otherwise)
        // from warning/kicking the bot itself or the owner — a mistaken
        // .warn on either of them would count down toward an actual kick.
        // Neither should ever be a valid warn target.
        if (bot.permission.isBotSelf(target)) {
            return await m.reply('❌ I can\'t warn myself.');
        }
        if (bot.permission.isOwner(target)) {
            return await m.reply('❌ The owner can\'t be warned.');
        }

        // Reason: everything in args that is not the mention
        const reason = args.filter(a => !a.startsWith('@')).join(' ').trim() || 'Reason not specified';

        // Who issued the warn
        const issuerNum  = m.sender.replace(/:[0-9]+@/, '@').split('@')[0];
        const issuerName = m.pushName || issuerNum;
        const time       = nigerianTime();

        const db  = loadDB();
        const key = `${m.chat}_${target}`;

        // Init — new structure stores array of warn objects
        if (!db[key] || typeof db[key] === 'number') {
            db[key] = { count: typeof db[key] === 'number' ? db[key] : 0, history: [] };
        }

        db[key].count++;
        db[key].history.push({ reason, issuer: m.sender, issuerName, time });
        const count = db[key].count;

        // Delete the message being warned for. If this .warn was sent as a
        // reply to the offending message, that quoted message is what gets
        // deleted (e.g. admin replies "fuck you" with .warn spam) — the
        // flagged message disappears the same way an anti-system deletion
        // would. If .warn was just a tag with no reply, there's no specific
        // message to delete, so this is skipped.
        const quoted = getQuoted(bot, m);
        if (quoted?.key) {
            try { await bot.sock.sendMessage(m.chat, { delete: quoted.key }); } catch {}
        }

        if (count >= MAX_WARNS) {
            // Kick on max warns
            db[key] = { count: 0, history: [] };
            saveDB(db);
            await bot.sock.groupParticipantsUpdate(m.chat, [target], 'remove').catch(() => {});
            return await bot.sendMessage(m.chat, {
                text: `⛔ @${target.split('@')[0]} has been removed after reaching ${MAX_WARNS}/${MAX_WARNS} warnings.\nLast reason: ${reason}`,
                mentions: [target]
            });
        }

        saveDB(db);

        await bot.sendMessage(m.chat, {
            text:
`⚠️ *WARNING ${count}/${MAX_WARNS}*
👤 User: @${target.split('@')[0]}
📝 Reason: ${reason}
🛡 Issued by: ${issuerName}
🕐 Time: ${time}

${MAX_WARNS - count} warning(s) left before removal.`,
            mentions: [target]
        });
    }
};
