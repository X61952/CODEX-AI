const fs = require('fs-extra');
const AntiSystems = require('../../lib/antiSystems');
const tz = require('../../lib/timezone');

// Entries are written by lib/antiSystems.js#_modLog on every anti-system action.
// This file is only the on/off/retention toggle and the log viewer.
module.exports = {
    name: 'modlog',
    aliases: ['modlogs'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Keep a log of every anti-system action in this group',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub     = args[0]?.toLowerCase();
        const dbPath  = './database/modlogsettings.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        fs.ensureDirSync('./database');
        if (!db[groupId]) db[groupId] = { enabled: false, days: 30 };
        const s    = db[groupId];
        const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        if (!sub || sub === 'status') return await m.reply(
`modlog status\nStatus: ${s.enabled ? 'ON' : 'OFF'}\nRetention: ${s.days||30} days\nEntries: ${AntiSystems.readModLog(groupId).length}\n\nUsage:\n${bot.prefix}modlog on/off\n${bot.prefix}modlog days <1-90>\n${bot.prefix}modlog view [n]\n${bot.prefix}modlog clear`);

        if (sub === 'on')  { s.enabled = true;  save(); return await m.reply('ModLog enabled.'); }
        if (sub === 'off') { s.enabled = false; save(); return await m.reply('ModLog disabled.'); }
        if (sub === 'days' || /^\d+d?$/.test(sub)) {
            const n = parseInt(String(sub === 'days' ? args[1] : sub).replace(/[^0-9]/g, ''));
            if (!n || n < 1 || n > 90) return await m.reply('Retention must be 1-90 days.');
            s.days = n; save();
            return await m.reply(`ModLog retention set to ${n} days.`);
        }
        if (sub === 'clear') { AntiSystems.clearModLog(groupId); return await m.reply('ModLog cleared for this group.'); }
        if (sub === 'view' || sub === 'list' || sub === 'show') {
            const n = Math.min(Math.max(parseInt(args[1]) || 10, 1), 25);
            const rows = AntiSystems.readModLog(groupId).slice(-n).reverse();
            if (!rows.length) return await m.reply('ModLog is empty for this group.');
            const out = rows.map((r) => {
                const when = new Date(r.t).toLocaleString('en-NG', { timeZone: tz.get(), hour12: true });
                return `• ${when}\n  @${String(r.user).split('@')[0]} — ${r.action}\n  ${r.reason}`;
            }).join('\n');
            return await bot.sendMessage(groupId, {
                text: `ModLog (last ${rows.length})\n\n${out}`,
                mentions: rows.map((r) => r.user).filter(Boolean),
            }, { quoted: m });
        }
        return await m.reply(`Unknown option. Use ${bot.prefix}modlog status`);
    }
};
