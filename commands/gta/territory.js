const { getGtaUser, saveGtaUser, getTerritories, saveTerritories, getGangDb, saveGangDb, GANGS, WEAPONS, getWantedLabel } = require('../../lib/gtaEngine');
const { loadDB, saveDB, getUser, addXP, onCooldown, setCooldown, formatCooldown, fmt } = require('../../lib/economyEngine');

const WAR_CD = 2 * 60 * 60 * 1000; // 2 hours
const TERRITORY_INCOME_CD = 24 * 60 * 60 * 1000;
const MAX_INCOME_HOURS = 24;

module.exports = {
    name: 'territory',
    aliases: ['turf', 'hood', 'map'],
    category: 'gta',
    reactions: { start: '⚙️' },
    description: 'View and attack territories',

    async execute(bot, m, args) {
        const sub  = args[0]?.toLowerCase();
        const gta  = getGtaUser(m.sender);
        const terrDb = getTerritories();
        const terrs  = terrDb.territories || [];

        if (!sub || sub === 'map') {
            const map = terrs.map(t => {
                const g = t.gang ? (GANGS[t.gang]?.tag || t.gang) : '⚪ Neutral';
                return `${g} — *${t.name}* (🪙${t.value}/hr)`;
            }).join('\n');
            const income = terrs.filter(t => t.gang === gta.gang).reduce((s,t) => s + t.value, 0);
            return await m.reply(
`🗺️ *LOS SANTOS TERRITORY MAP*

${map}

${gta.gang ? `${GANGS[gta.gang]?.emoji} Your gang income: 🪙${income}/hr from ${terrs.filter(t=>t.gang===gta.gang).length} territories\nCollect up to 24 hours: ${bot.prefix}territory collect` : 'Join a gang to claim territory'}

Attack: ${bot.prefix}territory attack <name>`);
        }

        if (sub === 'collect' || sub === 'claim') {
            if (!gta.gang) return await m.reply('❌ Join a gang first to collect turf income.');
            const incomePerHour = terrs
                .filter(t => t.gang === gta.gang)
                .reduce((total, territory) => total + territory.value, 0);
            if (!incomePerHour) return await m.reply('❌ Your gang controls no territories to collect income from.');

            const db = loadDB();
            const economyUser = getUser(db, m.sender);
            const now = Date.now();
            const wait = onCooldown(economyUser, 'territoryIncome', TERRITORY_INCOME_CD);
            if (wait) {
                return await m.reply(`⏳ Turf income is already collected. Try again in *${formatCooldown(wait)}*.`);
            }
            const lastClaim = economyUser.cooldowns.territoryIncome || now - 60 * 60 * 1000;
            const elapsed = Math.min(now - lastClaim, MAX_INCOME_HOURS * 60 * 60 * 1000);
            const income = Math.floor(incomePerHour * elapsed / (60 * 60 * 1000));
            if (!income) return await m.reply('⏳ Your turf has not generated any claimable income yet.');

            economyUser.wallet += income;
            economyUser.stats.earned = (economyUser.stats.earned || 0) + income;
            setCooldown(economyUser, 'territoryIncome');
            saveDB(db);
            return await m.reply(
                `💵 Collected *${fmt(income)}* codex from your gang's territories.\n` +
                `Rate: ${fmt(incomePerHour)} codex/hour (up to 24 hours).\n` +
                `Wallet: *${fmt(economyUser.wallet)}* codex.`
            );
        }

        if (sub === 'attack') {
            if (!gta.gang) return await m.reply('❌ Join a gang first!');
            if (!gta.weapon || gta.weapon === 'fists') return await m.reply('❌ Get a weapon first!');
            const tName = args.slice(1).join(' ').toLowerCase();
            const terr  = terrs.find(t => t.name.toLowerCase().includes(tName) || t.id.includes(tName));
            if (!terr) return await m.reply(`❌ Territory not found. Use ${bot.prefix}territory map`);
            if (terr.gang === gta.gang) return await m.reply('✅ You already own this turf!');

            // Cooldown
            const now = Date.now();
            const lastWar = gta.cooldowns?.war || 0;
            if (now - lastWar < WAR_CD) {
                const rem = WAR_CD - (now - lastWar);
                const h   = Math.floor(rem/3600000), mn = Math.floor((rem%3600000)/60000);
                return await m.reply(`⏳ Cooldown! Attack again in *${h}h ${mn}m*`);
            }

            // Battle calculation
            const weapon    = WEAPONS[gta.weapon] || WEAPONS.fists;
            const ammoLeft  = gta.ammo?.[gta.weapon] || 0;
            if (gta.weapon !== 'fists' && ammoLeft <= 0) return await m.reply(`❌ No ammo! Buy some with ${bot.prefix}ammo buy ${gta.weapon}`);

            const attackPow = weapon.damage + (gta.battle?.str || 10) + Math.floor(Math.random() * 30);
            const defPow    = 50 + (terr.gang ? 30 : 0) + Math.floor(Math.random() * 40);
            const win       = attackPow > defPow;

            // Use ammo
            if (gta.weapon !== 'fists') gta.ammo[gta.weapon] = Math.max(0, ammoLeft - 5);

            gta.cooldowns = gta.cooldowns || {};
            gta.cooldowns.war = now;

            if (win) {
                const oldGang = terr.gang;
                terr.gang = gta.gang;
                saveTerritories(terrDb);
                gta.respect = (gta.respect || 0) + 50;
                gta.kills   = (gta.kills || 0) + 1;
                gta.wantedStars = Math.min(5, (gta.wantedStars || 0) + 2);
                saveGtaUser(m.sender, gta);
                const reward = terr.value * 2;
                const db = loadDB(); const user = getUser(db, m.sender);
                user.wallet = (user.wallet||0) + reward;
                user.stats.earned = (user.stats.earned || 0) + reward;
                addXP(user, 25);
                saveDB(db);
                const gangs = getGangDb();
                if (!gangs[gta.gang]) gangs[gta.gang] = { territories: [] };
                if (!gangs[gta.gang].territories.includes(terr.id)) gangs[gta.gang].territories.push(terr.id);
                if (oldGang && gangs[oldGang]?.territories) {
                    gangs[oldGang].territories = gangs[oldGang].territories.filter(t => t !== terr.id);
                }
                saveGangDb(gangs);
                return await m.reply(
`🏆 *TURF WAR — VICTORY!*

${GANGS[gta.gang]?.emoji} You captured *${terr.name}*!
${oldGang ? `Taken from: ${GANGS[oldGang]?.tag}` : 'Neutral territory claimed!'}

💰 Reward: 🪙+${fmt(reward)}
💚 Respect: +50
⭐ Wanted: ${getWantedLabel(gta.wantedStars)}`);
            } else {
                gta.deaths   = (gta.deaths || 0) + 1;
                gta.health   = Math.max(10, (gta.health||100) - 30);
                gta.wantedStars = Math.min(5, (gta.wantedStars||0) + 1);
                saveGtaUser(m.sender, gta);
                return await m.reply(
`💀 *TURF WAR — DEFEAT!*

You got smoked trying to take *${terr.name}*!
${terr.gang ? `${GANGS[terr.gang]?.name} held their ground.` : 'Neutrals pushed you back.'}

❤️ Health: ${gta.health}/100 (-30)
⭐ Wanted: ${getWantedLabel(gta.wantedStars)}

Heal up before attacking again!`);
            }
        }
        return await m.reply(`Usage: ${bot.prefix}territory map/attack <name>/collect`);
    }
};
