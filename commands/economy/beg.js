const { loadDB, saveDB, getUser, onCooldown, setCooldown, formatCooldown, addXP, fmt, CURRENCY } = require('../../lib/economyEngine');

const COOLDOWN = 2 * 60 * 1000; // 2 minutes

const RESPONSES = [
    { msg: 'A stranger felt sorry for you', success: true },
    { msg: 'Someone tossed you some change', success: true },
    { msg: 'A rich user dropped their wallet near you', success: true },
    { msg: 'Nobody wants to help you 😢', success: false },
    { msg: 'You were ignored completely', success: false },
    { msg: 'Someone laughed at you and walked away', success: false },
];

module.exports = {
    name: 'beg',
    category: 'economy',
    reactions: { start: '⚙️' },
    description: 'Beg for coins (2 min cooldown)',

    async execute(bot, m, args) {
        const db = loadDB();
        const user = getUser(db, m.sender);

        const wait = onCooldown(user, 'beg', COOLDOWN);
        if (wait) return await m.reply(`⏳ You've begged too recently!\nWait *${formatCooldown(wait)}*.`);

        setCooldown(user, 'beg');

        const resp = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
        if (!resp.success) {
            saveDB(db);
            return await m.reply(`🙏 *BEG FAILED*\n─────────────\n${resp.msg}.`);
        }

        const earned = Math.floor(Math.random() * 80) + 10; // 10–90
        user.wallet += earned;
        user.stats.earned = (user.stats.earned || 0) + earned;
        addXP(user, 5);
        saveDB(db);

        await m.reply(`🙏 *BEGGING SUCCESS!*\n─────────────\n${resp.msg}!\n+*${fmt(earned)}* ${CURRENCY}\n💼 Balance: *${fmt(user.wallet)}* ${CURRENCY}`);
    }
};
