const fs = require('fs-extra');

// Enforced from lib/antiSystems.js#checkGroupJoin like akick/antifake.
// This file is only the on/off/threshold toggle.
module.exports = {
    name: 'antiraid',
    aliases: ['raid'],
    category: 'admin',
    reactions: { start: '🛡️' },
    description: 'Detect mass-joins and remove the raiders',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const groupId = m.chat;
        const sub     = args[0]?.toLowerCase();
        const dbPath  = './database/antiraid.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { db = {}; }
        fs.ensureDirSync('./database');
        if (!db[groupId]) db[groupId] = { enabled: false, count: 5, minutes: 10 };
        const s    = db[groupId];
        const save = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        if (!sub || sub === 'status') return await m.reply(
`antiraid status\nStatus: ${s.enabled ? 'ON' : 'OFF'}\nTrigger: ${s.count||5} joins within ${s.minutes||10} min\n\nWhen triggered, everyone who joined inside the window is removed, and new joins are removed until the window has passed.\n\nUsage:\n${bot.prefix}antiraid on/off\n${bot.prefix}antiraid <joins> <minutes>  (e.g. ${bot.prefix}antiraid 5 10)`);

        if (sub === 'on')  { s.enabled = true;  save(); return await m.reply('Anti-Raid enabled.'); }
        if (sub === 'off') { s.enabled = false; save(); return await m.reply('Anti-Raid disabled.'); }
        const a = parseInt(args[0]), b = parseInt(args[1]);
        if (a && b) {
            if (a < 2 || a > 50 || b < 1 || b > 120) return await m.reply(`Usage: ${bot.prefix}antiraid <joins 2-50> <minutes 1-120>`);
            s.count = a; s.minutes = b; save();
            return await m.reply(`Anti-Raid trigger set: ${a}+ joins within ${b} min.`);
        }
        return await m.reply(`Unknown option. Use ${bot.prefix}antiraid status`);
    }
};
