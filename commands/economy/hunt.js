const { loadDB, saveDB, getUser, onCooldown, setCooldown, formatCooldown, addXP, hasItem, removeItem, fmt, CURRENCY } = require('../../lib/economyEngine');

const COOLDOWN = 5 * 60 * 1000; // 5 minutes

const ANIMALS = [
    { name: 'nothing', emoji: '🌿', value: 0, chance: 0.20 },
    { name: 'a rabbit', emoji: '🐇', value: [50, 120], chance: 0.35 },
    { name: 'a deer', emoji: '🦌', value: [150, 350], chance: 0.25 },
    { name: 'a wild boar', emoji: '🐗', value: [300, 700], chance: 0.12 },
    { name: 'a legendary dragon', emoji: '🐉', value: [1000, 2500], chance: 0.08 },
];

module.exports = {
    name: 'hunt',
    aliases: ['hunting'],
    category: 'economy',
    reactions: { start: '⚙️' },
    description: 'Go hunting for coins (5 min cooldown)',

    async execute(bot, m, args) {
        const db = loadDB();
        const user = getUser(db, m.sender);

        const wait = onCooldown(user, 'hunt', COOLDOWN);
        if (wait) return await m.reply(`⏳ You're tracking your last target!\nTry again in *${formatCooldown(wait)}*.`);

        setCooldown(user, 'hunt');

        const hasRifle = hasItem(user, 'rifle');
        const roll = Math.random();
        let cumulative = 0;
        let result = ANIMALS[0];
        for (const a of ANIMALS) {
            cumulative += a.chance;
            if (roll < cumulative) { result = a; break; }
        }

        if (!result.value) {
            saveDB(db);
            return await m.reply(`🏹 *HUNT RESULT*\n─────────────\nYou found ${result.emoji} ${result.name}. The forest was empty.`);
        }

        let earned = Math.floor(Math.random() * (result.value[1] - result.value[0])) + result.value[0];
        let bonusNote = '';
        if (hasRifle) {
            earned = Math.floor(earned * 1.5);
            bonusNote = '\n🔫 *Rifle* bonus applied! (+50%)';
            user.inventory._rifleUses = (user.inventory._rifleUses || 10) - 1;
            if (user.inventory._rifleUses <= 0) {
                removeItem(user, 'rifle');
                delete user.inventory._rifleUses;
                bonusNote += '\n⚠️ Your Rifle broke!';
            }
        }

        user.wallet += earned;
        user.stats.earned = (user.stats.earned || 0) + earned;
        addXP(user, 25);
        saveDB(db);

        await m.reply(`🏹 *HUNT RESULT*\n─────────────\nYou hunted ${result.emoji} *${result.name}*!\n+*${fmt(earned)}* ${CURRENCY}${bonusNote}\n💼 Balance: *${fmt(user.wallet)}* ${CURRENCY}`);
    }
};
