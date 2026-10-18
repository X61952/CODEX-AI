const fs = require('fs-extra');

// Enforced from lib/antiSystems.js#checkAdminChange (called from
// app.js#handleGroupUpdate). This file is only the on/off toggle.
// The owner, mods and the bot itself are always allowed to promote.
module.exports = {
    name: 'antipromote',
    aliases: ['apromote'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Undo promotions made by anyone except the owner/mods/bot',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub     = args[0]?.toLowerCase();
        const dbPath  = './database/antipromote.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        fs.ensureDirSync('./database');
        if (!db[groupId]) db[groupId] = { enabled: false };
        const s    = db[groupId];
        const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        if (!sub || sub === 'status') return await m.reply(
`antipromote status\nStatus: ${s.enabled ? 'ON' : 'OFF'}\n\nWhen someone else promotes a member, that member is demoted again.\n\nUsage:\n${bot.prefix}antipromote on/off`);

        if (sub === 'on')  { s.enabled = true;  save(); return await m.reply('Anti-Promote enabled.'); }
        if (sub === 'off') { s.enabled = false; save(); return await m.reply('Anti-Promote disabled.'); }
        return await m.reply(`Unknown option. Use ${bot.prefix}antipromote status`);
    }
};
