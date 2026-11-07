const { loadDB, saveDB, getUser, onCooldown, setCooldown, formatCooldown, addXP, hasItem, removeItem, fmt, CURRENCY } = require('../../lib/economyEngine');

const COOLDOWN = 2 * 60 * 1000; // 2 minutes

const CATCHES = [
    { name: 'nothing', emoji: '🌊', value: 0, chance: 0.25 },
    { name: 'a small fish', emoji: '🐟', value: [30, 80], chance: 0.35 },
    { name: 'a big tuna', emoji: '🐠', value: [100, 250], chance: 0.25 },
    { name: 'a rare lobster', emoji: '🦞', value: [300, 600], chance: 0.12 },
    { name: 'a golden fish', emoji: '✨🐡', value: [700, 1500], chance: 0.03 },
];

module.exports = {
    name: 'fish',
    aliases: ['fishing'],
    category: 'economy',
    reactions: { start: '⚙️' },
    description: 'Go fishing for coins (2 min cooldown)',

    async execute(bot, m, args) {
        const db = loadDB();
        const user = getUser(db, m.sender);

        const wait = onCooldown(user, 'fish', COOLDOWN);
        if (wait) return await m.reply(`⏳ Your line is still in the water!\nTry again in *${formatCooldown(wait)}*.`);

        setCooldown(user, 'fish');

        const hasBonusRod = hasItem(user, 'fishingrod');
        const roll = Math.random();
        let cumulative = 0;
        let result = CATCHES[0];
        for (const c of CATCHES) {
            cumulative += c.chance;
            if (roll < cumulative) { result = c; break; }
        }

        if (!result.value) {
            saveDB(db);
            return await m.reply(`🎣 *FISHING RESULT*\n─────────────\nYou caught… ${result.emoji} ${result.name}.\nBetter luck next time!`);
        }

        let earned = Math.floor(Math.random() * (result.value[1] - result.value[0])) + result.value[0];
        let bonusNote = '';
        if (hasBonusRod) {
            earned = Math.floor(earned * 1.5);
            bonusNote = '\n🎣 *Fishing Rod* bonus applied! (+50%)';
            // Track rod uses
            user.inventory._fishingrodUses = (user.inventory._fishingrodUses || 10) - 1;
            if (user.inventory._fishingrodUses <= 0) {
                removeItem(user, 'fishingrod');
                delete user.inventory._fishingrodUses;
                bonusNote += '\n⚠️ Your Fishing Rod broke!';
            }
        }

        user.wallet += earned;
        user.stats.earned = (user.stats.earned || 0) + earned;
        addXP(user, 20);
        saveDB(db);

        await m.reply(`🎣 *FISHING RESULT*\n─────────────\nYou caught ${result.emoji} *${result.name}*!\n+*${fmt(earned)}* ${CURRENCY}${bonusNote}\n💼 Balance: *${fmt(user.wallet)}* ${CURRENCY}`);
    }
};
