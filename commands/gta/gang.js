const { getGtaUser, saveGtaUser, getGangDb, saveGangDb, GANGS, getRankByRespect } = require('../../lib/gtaEngine');
const { loadDB, getUser, fmt } = require('../../lib/economyEngine');

const JOIN_COST = 1000;

module.exports = {
    name: 'gang',
    aliases: ['faction', 'crew'],
    category: 'gta',
    reactions: { start: '⚙️' },
    description: 'Join, manage or view gang info',

    async execute(bot, m, args) {
        const sub  = args[0]?.toLowerCase();
        const gta  = getGtaUser(m.sender);
        const gangs = getGangDb();

        // ── No sub — show your gang ──────────────────────────────────────────
        if (!sub) {
            if (!gta.gang) return await m.reply(
`🏙️ *GROVE STREET, LOS SANTOS*

You're not in a gang yet!
Join one: *${bot.prefix}gang join <name>*

Available Gangs:
🟢 grove — Grove Street Families (Leader: CODEX)
🟣 ballas — Ballas
🟡 vagos — Vagos
🔵 aztecas — Varrio Los Aztecas

Cost to join: 🪙${fmt(JOIN_COST)}`);

            const g       = GANGS[gta.gang];
            const gDb     = gangs[gta.gang] || {};
            const members = gDb.members?.length || 1;
            const rank    = getRankByRespect(gta.respect || 0);
            return await m.reply(
`${g.emoji} *${g.name.toUpperCase()}*
${g.tag}

👤 Your Rank: ${rank}
💚 Respect: ${gta.respect || 0}
👥 Members: ${members}
🏴 Territories: ${(gangs[gta.gang]?.territories || []).length}

Use ${bot.prefix}gang info <name> for rival gang info
Use ${bot.prefix}gang members for member list
Use ${bot.prefix}gang leave to leave`);
        }

        // ── Join ─────────────────────────────────────────────────────────────
        if (sub === 'join') {
            if (gta.gang) return await m.reply(`❌ You're already in *${GANGS[gta.gang]?.name}*. Leave first.`);
            const pick = args[1]?.toLowerCase();
            if (!pick || !GANGS[pick]) return await m.reply(`❌ Unknown gang. Choose: grove, ballas, vagos, aztecas`);
            const ecoDb = loadDB();
            const ecoUser = getUser(ecoDb, m.sender);
            if ((ecoUser.wallet||0) < JOIN_COST) return await m.reply(`❌ Need 🪙${fmt(JOIN_COST)} to join. You have: 🪙${fmt(ecoUser.wallet||0)}`);
            ecoUser.wallet -= JOIN_COST;
            ecoUser.stats.spent = (ecoUser.stats.spent || 0) + JOIN_COST;
            const { saveDB } = require('../../lib/economyEngine');
            saveDB(ecoDb);
            gta.gang    = pick;
            gta.rank    = 'Recruit';
            gta.respect = 0;
            saveGtaUser(m.sender, gta);
            if (!gangs[pick]) gangs[pick] = { members: [], territories: [] };
            if (!gangs[pick].members.includes(m.sender)) gangs[pick].members.push(m.sender);
            saveGangDb(gangs);
            return await m.reply(`✅ You joined *${GANGS[pick].name}*!\n${GANGS[pick].emoji} Welcome to the set, homie.\nCost: 🪙-${fmt(JOIN_COST)}`);
        }

        // ── Leave ─────────────────────────────────────────────────────────────
        if (sub === 'leave') {
            if (!gta.gang) return await m.reply('❌ You\'re not in a gang.');
            const oldGang = gta.gang;
            gta.gang = null; gta.rank = null; gta.respect = 0;
            saveGtaUser(m.sender, gta);
            if (gangs[oldGang]?.members) {
                gangs[oldGang].members = gangs[oldGang].members.filter(j => j !== m.sender);
                saveGangDb(gangs);
            }
            return await m.reply(`👋 You left *${GANGS[oldGang].name}*.\nYou're no longer affiliated.`);
        }

        // ── Members ───────────────────────────────────────────────────────────
        if (sub === 'members') {
            if (!gta.gang) return await m.reply('❌ You\'re not in a gang.');
            const gDb  = gangs[gta.gang] || { members: [] };
            if (!gDb.members?.length) return await m.reply('No members found.');
            const list = gDb.members.slice(0, 20).map((j,i) => {
                const u = getGtaUser(j);
                return `${i+1}. +${j.split('@')[0]} — ${getRankByRespect(u.respect||0)}`;
            }).join('\n');
            return await m.reply(`${GANGS[gta.gang].emoji} *${GANGS[gta.gang].name} MEMBERS*\n\n${list}`);
        }

        // ── Info ──────────────────────────────────────────────────────────────
        if (sub === 'info') {
            const pick = args[1]?.toLowerCase();
            const g    = GANGS[pick || gta.gang];
            if (!g) return await m.reply('Usage: .gang info <grove/ballas/vagos/aztecas>');
            const gDb  = gangs[pick || gta.gang] || {};
            return await m.reply(
`${g.emoji} *${g.name.toUpperCase()}*
Tag: ${g.tag}
Color: ${g.color}
Leader: ${g.leader || 'Undecided'}
Members: ${gDb.members?.length || 0}
Territories: ${gDb.territories?.length || 0}`);
        }

        return await m.reply(`Usage: ${bot.prefix}gang join/leave/members/info`);
    }
};
