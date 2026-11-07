const { loadDB, saveDB, getUser, onCooldown, setCooldown, formatCooldown, addXP, fmt, CURRENCY } = require('../../lib/economyEngine');
const { getGtaUser, addWantedStars, getWantedLabel } = require('../../lib/gtaEngine');

const COOLDOWN = 5 * 60 * 1000; // 5 minutes

const CRIMES = [
    { action: 'robbed a bank', reward: [800, 2000], fine: [200, 600] },
    { action: 'pickpocketed a tourist', reward: [200, 600], fine: [100, 300] },
    { action: 'hacked a system', reward: [500, 1500], fine: [300, 800] },
    { action: 'hijacked a delivery truck', reward: [600, 1800], fine: [250, 700] },
    { action: 'counterfeited currency', reward: [400, 1200], fine: [200, 500] },
];

module.exports = {
    name: 'crime',
    category: 'economy',
    reactions: { start: '⚙️' },
    description: 'Commit a crime — high reward, risk of fine (5 min cooldown)',

    async execute(bot, m, args) {
        const db = loadDB();
        const user = getUser(db, m.sender);
        const currentWantedStars = getGtaUser(m.sender).wantedStars || 0;
        const fineMultiplier = 1 + currentWantedStars * 0.1;

        const wait = onCooldown(user, 'crime', COOLDOWN);
        if (wait) return await m.reply(`Crime is on cooldown. Try again in *${formatCooldown(wait)}*.`);

        setCooldown(user, 'crime');

        const crime = CRIMES[Math.floor(Math.random() * CRIMES.length)];
        const caughtChance = Math.min(0.95, 0.40 + currentWantedStars * 0.05);
        const caught = Math.random() < caughtChance;

        if (caught) {
            const wantedStars = addWantedStars(m.sender, 2);
            const baseFine = Math.floor(Math.random() * (crime.fine[1] - crime.fine[0])) + crime.fine[0];
            const fine = Math.floor(baseFine * fineMultiplier);
            const actual = Math.min(fine, user.wallet);
            user.wallet = Math.max(0, user.wallet - actual);
            user.stats.lost = (user.stats.lost || 0) + actual;
            user.nerve = Math.max(0,(user.nerve??100)-10);
            saveDB(db);
            return await m.reply(`Crime failed. Fine: *${fmt(actual)}* ${CURRENCY}.\nWanted: ${getWantedLabel(wantedStars)}.\nWallet: *${fmt(user.wallet)}* ${CURRENCY}.`);
        }

        const wantedStars = addWantedStars(m.sender, 1);
        const reward = Math.floor(Math.random() * (crime.reward[1] - crime.reward[0])) + crime.reward[0];
        user.wallet += reward;
        user.stats.earned = (user.stats.earned || 0) + reward;
        addXP(user, 40);
        saveDB(db);

        await m.reply(`Crime successful. Earned *${fmt(reward)}* ${CURRENCY}.\nWanted: ${getWantedLabel(wantedStars)}.\nWallet: *${fmt(user.wallet)}* ${CURRENCY}.`);
    }
};
