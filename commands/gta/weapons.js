const { getGtaUser, saveGtaUser, WEAPONS, ARMOR } = require('../../lib/gtaEngine');
const { loadDB, saveDB, getUser, fmt } = require('../../lib/economyEngine');

module.exports = {
    name: 'weapons',
    aliases: ['gun', 'guns', 'armory', 'weapon'],
    category: 'gta',
    reactions: { start: '⚙️' },
    description: 'Buy weapons and armor from Ammu-Nation',

    async execute(bot, m, args) {
        const sub = args[0]?.toLowerCase();
        const gta = getGtaUser(m.sender);

        if (!sub || sub === 'list') {
            const owned   = gta.weapons || ['fists'];
            const wList   = Object.entries(WEAPONS)
                .map(([id,w]) => `${w.emoji} *${w.name}* — 🪙${fmt(w.price)} | DMG: ${w.damage} ${owned.includes(id) ? '✅' : ''}`)
                .join('\n');
            const curArmor = ARMOR[gta.armor_type || 'none'];
            return await m.reply(
`🔫 *AMMU-NATION — LOS SANTOS*

Current weapon: ${WEAPONS[gta.weapon || 'fists']?.emoji} ${WEAPONS[gta.weapon || 'fists']?.name}
Current armor: ${curArmor.emoji} ${curArmor.name} (${curArmor.protect}% protection)
Health: ❤️ ${gta.health || 100}/${gta.maxHealth || 100}

*WEAPONS:*
${wList}

*ARMOR:*
${Object.entries(ARMOR).map(([id,a]) => `${a.emoji} *${a.name}* — 🪙${fmt(a.price)} | ${a.protect}% protect ${gta.armor_type===id?'✅':''}`).join('\n')}

Usage:
${bot.prefix}weapons buy <weapon>
${bot.prefix}weapons armor <type>
${bot.prefix}weapons equip <weapon>`);
        }

        if (sub === 'buy') {
            const id = args[1]?.toLowerCase();
            if (!id || !WEAPONS[id]) return await m.reply(`❌ Unknown weapon. Use ${bot.prefix}weapons list`);
            if (id === 'fists') return await m.reply('You already have fists for free 😄');
            if ((gta.weapons||[]).includes(id)) return await m.reply(`✅ You already own ${WEAPONS[id].name}`);
            const db = loadDB(); const user = getUser(db, m.sender);
            const w  = WEAPONS[id];
            if ((user.wallet||0) < w.price) return await m.reply(`❌ Need 🪙${fmt(w.price)}\nYou have: 🪙${fmt(user.wallet||0)}`);
            user.wallet -= w.price;
            user.stats.spent = (user.stats.spent || 0) + w.price;
            saveDB(db);
            if (!gta.weapons) gta.weapons = ['fists'];
            gta.weapons.push(id);
            gta.weapon = id;
            if (!gta.ammo) gta.ammo = {};
            gta.ammo[id] = (gta.ammo[id] || 0) + 30; // starter ammo
            saveGtaUser(m.sender, gta);
            return await m.reply(`✅ Purchased ${w.emoji} *${w.name}*!\nDamage: ${w.damage}\n+30 starter ammo included!\nCost: 🪙${fmt(w.price)}`);
        }

        if (sub === 'armor') {
            const id = args[1]?.toLowerCase();
            if (!id || !ARMOR[id]) return await m.reply(`❌ Unknown armor type. Use ${bot.prefix}weapons list`);
            const db = loadDB(); const user = getUser(db, m.sender);
            const a  = ARMOR[id];
            if ((user.wallet||0) < a.price) return await m.reply(`❌ Need 🪙${fmt(a.price)}\nYou have: 🪙${fmt(user.wallet||0)}`);
            user.wallet -= a.price;
            user.stats.spent = (user.stats.spent || 0) + a.price;
            saveDB(db);
            gta.armor_type = id;
            gta.armor      = a.protect;
            saveGtaUser(m.sender, gta);
            return await m.reply(`✅ Equipped ${a.emoji} *${a.name}*!\n${a.protect}% damage protection\nCost: 🪙${fmt(a.price)}`);
        }

        if (sub === 'equip') {
            const id = args[1]?.toLowerCase();
            if (!id || !WEAPONS[id]) return await m.reply('❌ Unknown weapon');
            if (!(gta.weapons||['fists']).includes(id)) return await m.reply(`❌ You don't own ${WEAPONS[id]?.name}. Buy it first.`);
            gta.weapon = id;
            saveGtaUser(m.sender, gta);
            return await m.reply(`✅ Equipped ${WEAPONS[id].emoji} *${WEAPONS[id].name}*`);
        }

        return await m.reply(`Usage: ${bot.prefix}weapons list/buy/armor/equip`);
    }
};
