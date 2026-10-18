const fs = require('fs-extra');

// AntiBug — crash/lag-payload protection. Detection: lib/antiBug.js,
// enforcement: lib/antiSystems.js#checkBug. The action is always BLOCK:
// the offending message is deleted (groups), the sender is blocked on
// WhatsApp, and removed from the group when the bot is an admin.
// ON by default everywhere (groups and DMs); .antibug off turns it off for
// one group, .antibug global off (owner) turns off the default.
module.exports = {
    name: 'antibug',
    aliases: ['abug', 'antycrash', 'anticrash'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Block anyone who sends crash/lag bug payloads (action: block)',

    async execute(bot, m, args) {
        const dbPath = './database/antibug.json';
        const sub = (args[0] || '').toLowerCase();
        const isOwner = !!m.key?.fromMe || bot.permission.isOwner(m.sender);

        let isAdmin = isOwner;
        if (m.isGroup && !isAdmin) {
            try { isAdmin = await bot.permission.isAdmin(m.chat, m.sender, m._participantRaw); } catch {}
        }

        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        const mode = ['dm', 'group'].includes(db._mode) ? db._mode : 'both';
        const globalOn = db._global ? db._global.enabled !== false : true;
        const groupOn = m.isGroup && db[m.chat] && typeof db[m.chat].enabled === 'boolean' ? db[m.chat].enabled : globalOn;
        const save = () => { fs.ensureDirSync('./database'); fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); };

        if (!sub || sub === 'status') {
            return await m.reply(
`antibug status
Mode: ${mode === 'both' ? 'DM + GROUP' : mode.toUpperCase()}
${m.isGroup ? `This group: ${groupOn ? 'ON' : 'OFF'}\n` : ''}Default (DMs + groups): ${globalOn ? 'ON' : 'OFF'}
Action: BLOCK

Detects: huge channel admin invites, sticker pack flooding, status-mention flooding, file flooding, text/invisible-character walls, mention walls, oversized vCards/locations/polls/events/interactive messages, absurd media metadata and deeply nested messages.

Usage:
${bot.prefix}antibug on/off
${bot.prefix}antibug mode group  (protect groups only)
${bot.prefix}antibug mode dm  (protect DMs only)
${bot.prefix}antibug mode both${isOwner ? `\n${bot.prefix}antibug global on/off` : ''}`);
        }

        if (sub === 'mode') {
            if (!isOwner) return await m.reply('Only the owner can change the AntiBug mode.');
            const v = (args[1] || '').toLowerCase();
            const pick = v === 'groups' ? 'group' : v === 'dms' ? 'dm' : v;
            if (!['group', 'dm', 'both'].includes(pick)) return await m.reply(`Usage:\n${bot.prefix}antibug mode group\n${bot.prefix}antibug mode dm\n${bot.prefix}antibug mode both`);
            db._mode = pick;
            save();
            return await m.reply(`AntiBug mode set to ${pick === 'both' ? 'DM + GROUP' : pick.toUpperCase() + ' only'}.`);
        }

        if (sub === 'global') {
            if (!isOwner) return await m.reply('Only the owner can change the global AntiBug default.');
            const v = (args[1] || '').toLowerCase();
            if (v !== 'on' && v !== 'off') return await m.reply(`Usage: ${bot.prefix}antibug global on/off`);
            db._global = { enabled: v === 'on' };
            save();
            return await m.reply(`AntiBug default ${v === 'on' ? 'enabled' : 'disabled'} (DMs and groups without their own setting).`);
        }

        if (sub === 'on' || sub === 'off') {
            if (m.isGroup) {
                if (!isAdmin) return await m.reply('Only group admins can change AntiBug.');
                db[m.chat] = { enabled: sub === 'on' };
            } else {
                if (!isOwner) return await m.reply('Only the owner can change AntiBug in DMs.');
                db._global = { enabled: sub === 'on' };
            }
            save();
            return await m.reply(`AntiBug ${sub === 'on' ? 'enabled' : 'disabled'}${m.isGroup ? ' for this group' : ' (default)'}.`);
        }

        return await m.reply(`Unknown option. Use ${bot.prefix}antibug status`);
    },
};
