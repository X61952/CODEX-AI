const { loadDB, saveDB, getUser, onCooldown, setCooldown, formatCooldown, addXP, hasItem, removeItem, fmt, CURRENCY } = require('../../lib/economyEngine');

const COOLDOWN = 6 * 60 * 1000; // 6 minutes

const GEMS = [
    { name: 'dirt', emoji: '🪨', value: 0, chance: 0.20 },
    { name: 'coal', emoji: '🖤', value: [40, 100], chance: 0.35 },
    { name: 'iron ore', emoji: '⚙️', value: [100, 250], chance: 0.25 },
    { name: 'gold nugget', emoji: '🟡', value: [300, 700], chance: 0.12 },
    { name: 'diamond', emoji: '💎', value: [800, 2000], chance: 0.08 },
];

module.exports = {
    name: 'mine',
    aliases: ['mining'],
    category: 'economy',
    reactions: { start: '⚙️' },
    description: 'Mine for gems and coins (6 min cooldown)',

    async execute(bot, m, args) {
        const db = loadDB();
        const user = getUser(db, m.sender);

        const wait = onCooldown(user, 'mine', COOLDOWN);
        if (wait) return await m.reply(`⏳ You're still in the mine!\nCome back in *${formatCooldown(wait)}*.`);

        setCooldown(user, 'mine');

        const hasPickaxe = hasItem(user, 'pickaxe');
        const roll = Math.random();
        let cumulative = 0;
        let result = GEMS[0];
        for (const g of GEMS) {
            cumulative += g.chance;
            if (roll < cumulative) { result = g; break; }
        }

        if (!result.value) {
            saveDB(db);
            return await m.reply(`⛏️ *MINING RESULT*\n─────────────\nYou only found ${result.emoji} ${result.name}. Nothing valuable today.`);
        }

        let earned = Math.floor(Math.random() * (result.value[1] - result.value[0])) + result.value[0];
        let bonusNote = '';
        if (hasPickaxe) {
            earned = Math.floor(earned * 1.5);
            bonusNote = '\n⛏️ *Pickaxe* bonus applied! (+50%)';
            user.inventory._pickaxeUses = (user.inventory._pickaxeUses || 10) - 1;
            if (user.inventory._pickaxeUses <= 0) {
                removeItem(user, 'pickaxe');
                delete user.inventory._pickaxeUses;
                bonusNote += '\n⚠️ Your Pickaxe broke!';
            }
        }

        user.wallet += earned;
        user.stats.earned = (user.stats.earned || 0) + earned;
        addXP(user, 30);
        saveDB(db);

        await m.reply(`⛏️ *MINING RESULT*\n─────────────\nYou mined ${result.emoji} *${result.name}*!\n+*${fmt(earned)}* ${CURRENCY}${bonusNote}\n💼 Balance: *${fmt(user.wallet)}* ${CURRENCY}`);
    }
};
