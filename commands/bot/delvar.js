const fs = require('fs-extra');

module.exports = {
    name: 'delvar',
    aliases: ['removevar', 'unsetvar'],
    category: 'bot',
    reactions: { start: '🔐' },
    description: 'Delete a stored variable. Usage: .delvar KEY',

    async execute(bot, m, args) {
        const key = args[0]?.trim();
        if (!key) return await m.reply(`Usage: ${bot.prefix}delvar KEY\nSee all variables: ${bot.prefix}listvar`);

        const dbPath = './database/variables.json';
        let db = {};
        try { db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch {}

        if (!Object.prototype.hasOwnProperty.call(db, key)) {
            return await m.reply(`Variable "${key}" not found.`);
        }

        delete db[key];
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        // Removing TIME_ZONE puts the bot back on the default zone straight away.
        if (key.toUpperCase() === 'TIME_ZONE') {
            const tz = require('../../lib/timezone');
            tz.set(tz.normalize(process.env.TIME_ZONE) || tz.DEFAULT_TZ);
        }
        await m.reply(`Variable "${key}" deleted.`);
    }
};
