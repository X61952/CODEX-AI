const { action, user, save } = require('../../lib/gtaFeatures');
const { loadDB, saveDB, getUser, addXP, fmt } = require('../../lib/economyEngine');
const { addWantedStars, getWantedLabel } = require('../../lib/gtaEngine');

const activities = {
    race: [300, 1200],
    rob: [500, 3000],
    gym: [100, 400],
    collect: [200, 600],
    streetfight: [400, 1800],
    chopshop: [700, 2500],
};

const VEHICLE_BONUS = {
    bicycle: 0.1,
    lowrider: 0.2,
    infernus: 0.35,
    hunter: 0.3,
    hydra: 0.5,
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

        const { u: availableAssets } = user(m.sender);
        if (['race', 'chopshop'].includes(activity) && !availableAssets.vehicles.length) {
            return await m.reply(
                `You need a vehicle for ${activity}. Buy one with ${bot.prefix}garage.`
            );
        }

        const result = action(m.sender, activity);
        if (!result.ok) return await m.reply(result.message);

        const db = loadDB();
        const economyUser = getUser(db, m.sender);
        const vehicleBonus = ['race', 'chopshop'].includes(activity)
            ? Math.max(...availableAssets.vehicles.map(vehicle => VEHICLE_BONUS[vehicle] || 0))
            : 0;
        const baseReward = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
        const reward = Math.floor(baseReward * (1 + vehicleBonus));
        economyUser.wallet += reward;
        economyUser.stats.earned = (economyUser.stats.earned || 0) + reward;
        addXP(economyUser, Math.floor(reward / 10));
        saveDB(db);

        const { db: gtaDb, u: gtaUser } = user(m.sender);
        if (activity === 'gym') gtaUser.skills.stamina = (gtaUser.skills.stamina || 1) + 1;
        save(m.sender, gtaUser, gtaDb);

        const wanted = activity === 'rob'
            ? `\nWanted: ${getWantedLabel(addWantedStars(m.sender, 1))}.`
            : '';

        return await m.reply(
            `${activity.toUpperCase()} complete. Earned ${fmt(reward)} codex.` +
            (vehicleBonus ? ` Vehicle bonus: +${Math.round(vehicleBonus * 100)}%.` : '') +
            wanted
        );
    },
};
