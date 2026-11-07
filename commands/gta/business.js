const { CATALOG, buy, user } = require('../../lib/gtaFeatures');
const {
    loadDB,
    saveDB,
    getUser,
    onCooldown,
    setCooldown,
    formatCooldown,
    fmt,
    CURRENCY,
} = require('../../lib/economyEngine');

const BUSINESS_CLAIM_COOLDOWN = 24 * 60 * 60 * 1000;
const BUSINESS_INCOME_RATE = 0.02;

module.exports = {
    name: 'business',
    aliases: ['businesses', 'empire'],
    category: 'gta',
    description: 'Buy businesses and collect their daily income',

    async execute(bot, m, args) {
        const { u } = user(m.sender);
        const subcommand = args[0]?.toLowerCase();

        if (subcommand === 'collect') {
            if (!u.businesses.length) {
                return await m.reply(`You don't own any businesses.`);
            }

            const economyDB = loadDB();
            const economyUser = getUser(economyDB, m.sender);
            const wait = onCooldown(economyUser, 'businessIncome', BUSINESS_CLAIM_COOLDOWN);
            if (wait) {
                return await m.reply(`Income already collected. Try again in *${formatCooldown(wait)}*.`);
            }

            const income = u.businesses.reduce(
                (total, name) => total + Math.floor((CATALOG.businesses[name] || 0) * BUSINESS_INCOME_RATE),
                0
            );
            if (!income) {
                return await m.reply('No business income to collect.');
            }

            economyUser.wallet += income;
            economyUser.stats.earned = (economyUser.stats.earned || 0) + income;
            setCooldown(economyUser, 'businessIncome');
            saveDB(economyDB);

            return await m.reply(
                `Collected *${fmt(income)}* ${CURRENCY}.\n` +
                `Wallet: *${fmt(economyUser.wallet)}* ${CURRENCY}.`
            );
        }

        if (!subcommand || subcommand === 'list') {
            return await m.reply(
                `BUSINESSES\n${Object.entries(CATALOG.businesses)
                    .map(([name, price]) => `${name}: ${price.toLocaleString()} codex`)
                    .join('\n')}\n\n` +
                `Owned: ${u.businesses.join(', ') || 'none'}\n` +
                `Collect owned business income with ${bot.prefix}business collect.`
            );
        }

        const result = buy(m.sender, 'businesses', subcommand);
        return await m.reply(
            result.ok
                ? `Business purchased for ${fmt(result.price)} ${CURRENCY}.`
                : result.message
        );
    },
};
