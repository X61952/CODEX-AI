const { getGtaUser, saveGtaUser, getWantedLabel } = require('../../lib/gtaEngine');
const { user: getGtaFeaturesUser } = require('../../lib/gtaFeatures');

const WANTED_FINE = [0, 500, 1500, 5000, 15000, 50000];
const LAY_LOW_COOLDOWN = 12 * 60 * 60 * 1000;
const PROPERTY_HEAT_REDUCTION = { safehouse: 1, mansion: 2, casino: 3 };

module.exports = {
    name: 'wanted',
    aliases: ['stars', 'police', 'wantedlevel'],
    category: 'gta',
    reactions: { start: '⚙️' },
    description: 'View or clear your wanted level',

    async execute(bot, m, args) {
        const gta = getGtaUser(m.sender);
        const sub = args[0]?.toLowerCase();
        const stars = gta.wantedStars || 0;

        if (!sub) {
            const label = getWantedLabel(stars);
            const msgs = [
                '✅ You\'re clean. No heat.',
                '🚔 Police are watching you.',
                '🚔🚔 Pursuit initiated! Shake them!',
                '🚨 SWAT deployed. You\'re a felon!',
                '🚨🚁 SWAT + Helicopter. Get out!',
                '🚁🚁 FBI + Military. You\'re done!',
            ];
            const responses = [
                '', 'Lay low for a while.', 'Try losing them in traffic.',
                'Get to a Pay \'N\' Spray!', 'Change your outfit NOW!', 'You\'re public enemy #1!'
            ];
            const { u: assets } = getGtaFeaturesUser(m.sender);
            const properties = Object.keys(PROPERTY_HEAT_REDUCTION)
                .filter(property => assets.properties.includes(property));
            return await m.reply(
`⭐ *WANTED LEVEL*

${label}
${msgs[Math.min(stars,5)]}

${stars > 0 ? `💡 Tip: ${responses[Math.min(stars,5)]}\n\nClear heat: ${bot.prefix}wanted clear (costs 🪙${(WANTED_FINE[Math.min(stars,5)]).toLocaleString()})${properties.length ? `\nLay low at your ${properties.join('/')} with ${bot.prefix}wanted laylow (12h cooldown)` : ''}` : 'You have no wanted stars.'}

Kills: ${gta.kills || 0} | Deaths: ${gta.deaths || 0}`);
        }

        if (sub === 'clear') {
            if (!stars) return await m.reply('✅ You\'re already clean!');
            const fine = WANTED_FINE[Math.min(stars,5)];
            const { loadDB, saveDB, getUser, fmt } = require('../../lib/economyEngine');
            const db = loadDB(); const user = getUser(db, m.sender);
            if ((user.wallet||0) < fine) return await m.reply(`❌ Need 🪙${fine.toLocaleString()} to pay off police.\nYou have: 🪙${fmt(user.wallet||0)}`);
            user.wallet -= fine;
            user.stats.spent = (user.stats.spent || 0) + fine;
            saveDB(db);
            gta.wantedStars = 0;
            saveGtaUser(m.sender, gta);
            return await m.reply(`✅ Wanted level cleared!\nPaid bribe: 🪙${fine.toLocaleString()}\nYou're clean now. 🤝`);
        }

        if (sub === 'laylow') {
            if (!stars) return await m.reply('✅ You already lost the police!');
            const { u: assets } = getGtaFeaturesUser(m.sender);
            const reduction = Math.max(
                ...assets.properties.map(property => PROPERTY_HEAT_REDUCTION[property] || 0),
                0
            );
            if (!reduction) return await m.reply(`❌ You need a property to lay low. Buy one with ${bot.prefix}property.`);

            const lastLayLow = gta.cooldowns?.laylow || 0;
            const remaining = LAY_LOW_COOLDOWN - (Date.now() - lastLayLow);
            if (remaining > 0) {
                const hours = Math.floor(remaining / (60 * 60 * 1000));
                const minutes = Math.ceil((remaining % (60 * 60 * 1000)) / (60 * 1000));
                return await m.reply(`⏳ Keep laying low for *${hours}h ${minutes}m* before using your property again.`);
            }

            const cleared = Math.min(stars, reduction);
            gta.wantedStars -= cleared;
            gta.cooldowns.laylow = Date.now();
            saveGtaUser(m.sender, gta);
            return await m.reply(
                `🏠 You laid low at your property and lost ${cleared} wanted star(s).\n` +
                `Wanted: ${getWantedLabel(gta.wantedStars)}.`
            );
        }

        return await m.reply(`Usage: ${bot.prefix}wanted [clear/laylow]`);
    }
};
