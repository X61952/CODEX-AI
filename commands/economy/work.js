const { loadDB, saveDB, getUser, onCooldown, setCooldown, formatCooldown, addXP, fmt, CURRENCY } = require('../../lib/economyEngine');

const COOLDOWN = 3 * 60 * 1000; // 3 minutes

const JOBS = [
    { name: 'Programmer', emoji: '💻', min: 200, max: 600 },
    { name: 'Chef', emoji: '👨‍🍳', min: 150, max: 400 },
    { name: 'Driver', emoji: '🚗', min: 100, max: 350 },
    { name: 'Doctor', emoji: '👨‍⚕️', min: 300, max: 700 },
    { name: 'Mechanic', emoji: '🔧', min: 180, max: 450 },
    { name: 'Teacher', emoji: '👩‍🏫', min: 120, max: 380 },
    { name: 'Streamer', emoji: '🎮', min: 50, max: 900 },
    { name: 'Artist', emoji: '🎨', min: 80, max: 500 },
    { name: 'Trader', emoji: '📈', min: 100, max: 800 },
    { name: 'Farmer', emoji: '🌾', min: 150, max: 400 },
];

module.exports = {
    name: 'work',
    category: 'economy',
    reactions: { start: '⚙️' },
    description: 'Work for coins (3 min cooldown)',

    async execute(bot, m, args) {
        const db = loadDB();
        const user = getUser(db, m.sender);

        const wait = onCooldown(user, 'work', COOLDOWN);
        if (wait) return await m.reply(`⏳ You're still tired from your last job!\nRest for *${formatCooldown(wait)}*.`);

        const job = JOBS[Math.floor(Math.random() * JOBS.length)];
        const earned = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;
        user.wallet += earned;
        user.stats.earned = (user.stats.earned || 0) + earned;
        setCooldown(user, 'work');
        const leveled = addXP(user, 30);
        // Drain nerve by 5 per work
        user.nerve = Math.max(0, (user.nerve ?? 100) - 5);
        saveDB(db);

        let text = `${job.emoji} *WORK COMPLETE!*\n─────────────\nJob: *${job.name}*\nEarned: +*${fmt(earned)}* ${CURRENCY}\n💼 Balance: *${fmt(user.wallet)}* ${CURRENCY}`;
        if (leveled) text += `\n\n🎉 *LEVEL UP!* You are now Level *${user.level}*!`;
        await m.reply(text);
    }
};
