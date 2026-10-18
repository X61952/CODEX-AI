const fs = require('fs-extra');

// Enforced from lib/antiSystems.js#_checkAllInner like every other anti-system.
// This file is only the on/off/action toggle. Group admins are always exempt.
module.exports = {
    name: 'antiimage',
    aliases: ['aimg', 'noimage'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Block images in this group',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub     = args[0]?.toLowerCase();
        const dbPath  = './database/antiimage.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        fs.ensureDirSync('./database');
        if (!db[groupId]) db[groupId] = { enabled: false, action: 'delete', maxWarns: 3 };
        const s    = db[groupId];
        const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        if (!sub || sub === 'status') return await m.reply(
`antiimage status\nStatus: ${s.enabled ? 'ON' : 'OFF'}\nAction: ${(s.action||'delete').toUpperCase()}\nMaxWarns: ${s.maxWarns||3}\n\nDeletes any image sent by a non-admin member.\n\nUsage:\n${bot.prefix}antiimage on/off\n${bot.prefix}antiimage delete\n${bot.prefix}antiimage kick\n${bot.prefix}antiimage warn [1-3]`);

        if (sub === 'on')     { s.enabled = true;  save(); return await m.reply('Anti-Image enabled.'); }
        if (sub === 'off')    { s.enabled = false; save(); return await m.reply('Anti-Image disabled.'); }
        if (sub === 'delete') { s.action = 'delete'; save(); return await m.reply('Action set to DELETE. Those messages are deleted immediately.'); }
        if (sub === 'kick')   { s.action = 'kick';   save(); return await m.reply('Action set to KICK. User kicked immediately.'); }
        if (sub === 'warn') {
            const n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) return await m.reply(`Usage: ${bot.prefix}antiimage warn [1-3]\nMax warnings allowed is 3.`);
            s.action = 'warn'; s.maxWarns = n; save();
            return await m.reply(`Action set to WARN. Max ${n} warnings before kick.`);
        }
        return await m.reply(`Unknown option. Use ${bot.prefix}antiimage status`);
    }
};
