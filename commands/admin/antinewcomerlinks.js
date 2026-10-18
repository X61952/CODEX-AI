const fs = require('fs-extra');

// Enforced from lib/antiSystems.js#_checkAllInner like every other anti-system.
// This file is only the on/off/action toggle. Group admins are always exempt.
module.exports = {
    name: 'antinewcomerlinks',
    aliases: ['anl','newcomerlinks'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Block links from members who just joined',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub     = args[0]?.toLowerCase();
        const dbPath  = './database/antinewcomerlinks.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        fs.ensureDirSync('./database');
        if (!db[groupId]) db[groupId] = { enabled: false, action: 'delete', maxWarns: 3, minutes: 10 };
        const s    = db[groupId];
        const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        if (!sub || sub === 'status') return await m.reply(
`antinewcomerlinks status\nStatus: ${s.enabled ? 'ON' : 'OFF'}\nAction: ${(s.action||'delete').toUpperCase()}\nMaxWarns: ${s.maxWarns||3}\nMinutes: ${s.minutes||10}\n\nDeletes links sent by non-admin members within the first few minutes after they join.\n\nUsage:\n${bot.prefix}antinewcomerlinks on/off\n${bot.prefix}antinewcomerlinks delete\n${bot.prefix}antinewcomerlinks kick\n${bot.prefix}antinewcomerlinks warn [1-3]\n${bot.prefix}antinewcomerlinks <1-60>  (minutes after joining)`);

        if (sub === 'on')     { s.enabled = true;  save(); return await m.reply('Anti-Newcomer-Links enabled.'); }
        if (sub === 'off')    { s.enabled = false; save(); return await m.reply('Anti-Newcomer-Links disabled.'); }
        if (sub === 'delete') { s.action = 'delete'; save(); return await m.reply('Action set to DELETE. Those messages are deleted immediately.'); }
        if (sub === 'kick')   { s.action = 'kick';   save(); return await m.reply('Action set to KICK. User kicked immediately.'); }
        if (sub === 'warn') {
            const n = parseInt(args[1]);
            if (!n || n < 1 || n > 3) return await m.reply(`Usage: ${bot.prefix}antinewcomerlinks warn [1-3]\nMax warnings allowed is 3.`);
            s.action = 'warn'; s.maxWarns = n; save();
            return await m.reply(`Action set to WARN. Max ${n} warnings before kick.`);
        }
        if (/^\d+m?$/.test(sub) || sub === 'minutes') {
            const n = parseInt(String(sub === 'minutes' ? args[1] : sub).replace(/[^0-9]/g, ''));
            if (!n || n < 1 || n > 60) return await m.reply('Use a number of minutes from 1 to 60.');
            s.minutes = n; save();
            return await m.reply(`Members who joined less than ${n} minutes ago cannot post links.`);
        }
        return await m.reply(`Unknown option. Use ${bot.prefix}antinewcomerlinks status`);
    }
};
