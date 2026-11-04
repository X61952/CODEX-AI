const { action, user, save } = require('../../lib/gtaFeatures');
const { loadDB, saveDB, getUser, fmt } = require('../../lib/economyEngine');

const activities = {
    race: [300, 1200],
    rob: [500, 3000],
    gym: [100, 400],
    collect: [200, 600],
    streetfight: [400, 1800],
    chopshop: [700, 2500],
};

module.exports = {
    name: 'activities',
    aliases: [...Object.keys(activities).filter(name => name !== 'rob'), 'gtarob'],
    category: 'gta',
    description: 'Interactive GTA activities',

    async execute(bot, m, args, commandName) {
        const invokedName = String(commandName || '').toLowerCase();
        const activity = invokedName === 'gtarob'
            ? 'rob'
            : activities[invokedName]
                ? invokedName
                : String(args[0] || '').toLowerCase();
        const range = activities[activity];

        if (!range) {
            return await m.reply(
                `Activities: ${Object.keys(activities).join(', ')}\n` +
                `Use ${bot.prefix}activities <activity>. GTA rob: ${bot.prefix}gtarob`
            );
        }

        const result = action(m.sender, activity);
        if (!result.ok) return await m.reply(result.message);

        const db = loadDB();
        const economyUser = getUser(db, m.sender);
        const reward = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
        economyUser.wallet += reward;
        economyUser.xp += Math.floor(reward / 10);
        saveDB(db);

        const { db: gtaDb, u: gtaUser } = user(m.sender);
        if (activity === 'gym') gtaUser.skills.stamina = (gtaUser.skills.stamina || 1) + 1;
        save(m.sender, gtaUser, gtaDb);

        return await m.reply(`${activity.toUpperCase()} complete. Earned ${fmt(reward)} codex.`);
    },
};
