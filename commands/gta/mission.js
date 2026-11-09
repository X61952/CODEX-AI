const { getGtaUser, saveGtaUser, CHARACTERS, EVENTS, getWantedLabel, GANGS } = require('../../lib/gtaEngine');
const { loadDB, saveDB, getUser, addXP, fmt } = require('../../lib/economyEngine');

const MISSION_CD = 30 * 60 * 1000; // 30 mins

const MISSIONS = [
    { id: 'big_smoke',  char: 'big_smoke', name: 'Wrong Side of the Tracks',   reward: [800,2000],   desc: 'Help Big Smoke hit some Vagos on the train', wantedGain: 1 },
    { id: 'sweet',      char: 'sweet',     name: 'Drive-By on Ballas',          reward: [600,1500],   desc: 'Ride with Sweet and spray some Ballas up', wantedGain: 2 },
    { id: 'ryder',      char: 'ryder',     name: 'Home Invasion',               reward: [700,1800],   desc: 'Steal army gear with Ryder', wantedGain: 2 },
    { id: 'tenpenny',   char: 'tenpenny',  name: 'Officer Tenpenny\'s Favor',   reward: [1000,3000],  desc: 'Do a dirty job for Tenpenny to stay out of jail', wantedGain: 0 },
    { id: 'cesar',      char: 'cesar',     name: 'Cesar\'s Challenge',          reward: [500,2500],   desc: 'Race Cesar\'s friends for respect', wantedGain: 0 },
    { id: 'og_loc',     char: 'og_loc',    name: 'OG Loc\'s Music Career',      reward: [400,1200],   desc: 'Help OG Loc with his "rap career"', wantedGain: 1 },
    { id: 'toreno',     char: 'toreno',    name: 'Toreno\'s Operation',         reward: [2000,6000],  desc: 'Secret government mission with Toreno', wantedGain: 3 },
    { id: 'woozie',     char: 'woozie',    name: 'Woozie\'s Casino Heist',      reward: [3000,10000], desc: 'Pull a heist with the Triads', wantedGain: 4 },
    { id: 'kendl',      char: 'kendl',     name: 'Kendl\'s Rescue',             reward: [500,2000],   desc: 'Save Kendl from the Ballas', wantedGain: 2 },
];

module.exports = {
    name: 'mission',
    aliases: ['missions', 'task', 'job'],
    category: 'gta',
    reactions: { start: '⚙️' },
    description: 'Run missions for GTA characters',

    async execute(bot, m, args) {
        const sub = args[0]?.toLowerCase();
        const gta = getGtaUser(m.sender);

        if (!sub || sub === 'list') {
            const list = MISSIONS.map((ms, i) => {
                const c = CHARACTERS[ms.char];
                return `${i+1}. ${c.emoji} *${ms.name}*\n   _${ms.desc}_\n   💰 ${fmt(ms.reward[0])}-${fmt(ms.reward[1])} | ⭐+${ms.wantedGain}`;
            }).join('\n\n');
            return await m.reply(`🎮 *GTA MISSIONS*\n\n${list}\n\nUse: ${bot.prefix}mission run <number>`);
        }

        if (sub === 'run') {
            const num = parseInt(args[1]);
            if (!num || num < 1 || num > MISSIONS.length) return await m.reply(`❌ Pick a mission 1-${MISSIONS.length}`);
            const ms  = MISSIONS[num - 1];
            const now = Date.now();
            const lastMs = gta.cooldowns?.mission || 0;
            if (now - lastMs < MISSION_CD) {
                const rem = MISSION_CD - (now - lastMs);
                return await m.reply(`⏳ You're still recovering. Come back in *${Math.ceil(rem/60000)} minutes*`);
            }

            const c    = CHARACTERS[ms.char];
            const luck = Math.random();
            const win  = luck > 0.30;

            gta.cooldowns = gta.cooldowns || {};
            gta.cooldowns.mission = now;

            if (win) {
                const reward = Math.floor(Math.random() * (ms.reward[1] - ms.reward[0])) + ms.reward[0];
                gta.wantedStars  = Math.min(5, (gta.wantedStars||0) + ms.wantedGain);
                gta.respect      = (gta.respect||0) + 30;
                gta.stats.missions = (gta.stats?.missions||0) + 1;
                saveGtaUser(m.sender, gta);
                const db = loadDB(); const user = getUser(db, m.sender);
                user.wallet = (user.wallet||0) + reward;
                user.stats.earned = (user.stats.earned || 0) + reward;
                addXP(user, 20);
                saveDB(db);
                return await m.reply(
`✅ *MISSION COMPLETE!*
${c.emoji} *${c.name}* says: "That's what I'm talkin' about!"

📋 ${ms.name}
💰 Reward: 🪙+${fmt(reward)}
💚 Respect: +30
⭐ Wanted: ${getWantedLabel(gta.wantedStars)}
🎯 XP: +20`);
            } else {
                gta.health = Math.max(10, (gta.health||100) - 20);
                gta.wantedStars = Math.min(5, (gta.wantedStars||0) + 1);
                saveGtaUser(m.sender, gta);
                return await m.reply(
`💀 *MISSION FAILED!*
${c.emoji} *${c.name}* says: "You're wack, homie!"

📋 ${ms.name}
❤️ Health: ${gta.health}/100 (-20)
⭐ Wanted: ${getWantedLabel(gta.wantedStars)}

Try again in 30 minutes.`);
            }
        }
        return await m.reply(`Usage: ${bot.prefix}mission list / ${bot.prefix}mission run <number>`);
    }
};
