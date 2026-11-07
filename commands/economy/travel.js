const {
    loadDB,
    saveDB,
    getUser,
    onCooldown,
    setCooldown,
    formatCooldown,
    addXP,
    fmt,
    CURRENCY,
} = require('../../lib/economyEngine');

const DESTINATIONS = [
    { name: 'Lagos', cost: 500, reward: [200, 1500], desc: 'You travelled to Lagos and hustled hard 🏙️' },
    { name: 'Dubai', cost: 2000, reward: [1000, 5000], desc: 'You flew to Dubai and made major deals 🌴' },
    { name: 'New York', cost: 3000, reward: [1500, 8000], desc: 'You hit New York and closed big business 🗽' },
    { name: 'Abuja', cost: 300, reward: [100, 900], desc: 'You went to Abuja and got government connections 🏛️' },
    { name: 'London', cost: 4000, reward: [2000, 10000], desc: 'You went to London and balled out 🎩' },
    { name: 'Accra', cost: 800, reward: [400, 2500], desc: 'You visited Accra and linked with big players 🇬🇭' },
    { name: 'Tokyo', cost: 5000, reward: [3000, 12000], desc: 'You explored Tokyo and found hidden opportunities 🗼' },
    { name: 'Port Harcourt', cost: 200, reward: [50, 700], desc: 'You went to PH and pumped some oil money ⛽' },
];

const COOLDOWN = 10 * 60 * 1000;

module.exports = {
    name: 'travel',
    aliases: ['trip', 'goto'],
    category: 'economy',
    reactions: { start: '⚙️' },
    description: 'Travel to a city and earn coins',

    async execute(bot, m, args) {
        const db = loadDB();
        const uid = m.sender;
        const storedUser = db[uid] || {};

        // Preserve legacy travel funds only for accounts without an economy wallet.
        if (storedUser.wallet === undefined && Number.isFinite(storedUser.balance)) {
            storedUser.wallet = storedUser.balance;
        }
        delete storedUser.balance;
        db[uid] = storedUser;

        const user = getUser(db, uid);
        if (!user.cooldowns.travel && user.lastTravel) {
            user.cooldowns.travel = user.lastTravel;
        }

        const dest = args[0]?.toLowerCase();
        const wait = onCooldown(user, 'travel', COOLDOWN);
        if (wait && !dest?.startsWith('f')) {
            return await m.reply(`Travel is on cooldown. Try again in *${formatCooldown(wait)}*.`);
        }

        if (!dest || dest === 'list') {
            const list = DESTINATIONS.map((destination, index) =>
                `${index + 1}. *${destination.name}* — Cost: 🪙${fmt(destination.cost)} | Earn: 🪙${fmt(destination.reward[0])}-${fmt(destination.reward[1])}`
            ).join('\n');
            return await m.reply(
                `✈️ *TRAVEL DESTINATIONS*\n\n${list}\n\n` +
                `Usage: ${bot.prefix}travel <city name>\n` +
                `Example: ${bot.prefix}travel Lagos\n\n` +
                `Your wallet: ${fmt(user.wallet)} ${CURRENCY}`
            );
        }

        const destination = DESTINATIONS.find(item => item.name.toLowerCase().includes(dest));
        if (!destination) {
            return await m.reply(`Unknown destination. Use ${bot.prefix}travel list.`);
        }

        if (user.wallet < destination.cost) {
            return await m.reply(
                `Not enough coins. Need *${fmt(destination.cost)}* ${CURRENCY}; ` +
                `wallet has *${fmt(user.wallet)}* ${CURRENCY}.`
            );
        }

        user.wallet -= destination.cost;
        const luck = Math.random();
        let result;

        if (luck > 0.30) {
            const earned = Math.floor(Math.random() * (destination.reward[1] - destination.reward[0] + 1)) + destination.reward[0];
            user.wallet += earned;
            addXP(user, 10);
            result = `Travel successful. Earned *${fmt(earned)}* ${CURRENCY}; ` +
                `cost *${fmt(destination.cost)}* ${CURRENCY}.`;
        } else {
            const lost = Math.floor(destination.cost * (0.3 + Math.random() * 0.5));
            user.wallet = Math.max(0, user.wallet - lost);
            result = `Travel failed. Lost *${fmt(destination.cost + lost)}* ${CURRENCY}.`;
        }

        setCooldown(user, 'travel');
        user.lastTravel = Date.now();
        user.location = destination.name;
        saveDB(db);

        return await m.reply(
            `${destination.name}: ${result}\nWallet: *${fmt(user.wallet)}* ${CURRENCY}.`
        );
    },
};
