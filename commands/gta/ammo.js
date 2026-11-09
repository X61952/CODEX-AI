const { getGtaUser, saveGtaUser, WEAPONS, fmt: gtaFmt } = require('../../lib/gtaEngine');
const { loadDB, saveDB, getUser, fmt } = require('../../lib/economyEngine');

const AMMO_PACKS = {
    pistol:  { perPack: 50,  price: 200  },
    shotgun: { perPack: 20,  price: 400  },
    uzi:     { perPack: 100, price: 500  },
    ak47:    { perPack: 60,  price: 800  },
    m4:      { perPack: 60,  price: 1000 },
    sniper:  { perPack: 10,  price: 600  },
    rpg:     { perPack: 3,   price: 3000 },
};

module.exports = {
    name: 'ammo',
    aliases: ['bullets', 'ammunition'],
    category: 'gta',
    reactions: { start: '⚙️' },
    description: 'Buy ammo for your weapons',

    async execute(bot, m, args) {
        const gta  = getGtaUser(m.sender);
        const sub  = args[0]?.toLowerCase();

        if (!sub || sub === 'list') {
            const owned = gta.weapons || ['fists'];
            const list  = Object.entries(AMMO_PACKS)
                .filter(([id]) => owned.includes(id))
                .map(([id, a]) => `${WEAPONS[id]?.emoji} *${id}* — 🪙${fmt(a.price)} for ${a.perPack} bullets`)
                .join('\n') || 'Buy weapons first with .weapons buy';
            return await m.reply(
`🔫 *AMMUNITION STORE — Ammu-Nation*

Your ammo:
${Object.entries(gta.ammo||{}).filter(([,v])=>v>0).map(([k,v])=>`${WEAPONS[k]?.emoji} ${k}: ${v}`).join('\n') || 'Empty'}

Buy ammo for your weapons:
${list}

Usage: ${bot.prefix}ammo buy <weapon> [packs]
Example: ${bot.prefix}ammo buy ak47 3`);
        }

        if (sub === 'buy') {
            const weapon = args[1]?.toLowerCase();
            const packs  = Math.min(parseInt(args[2]) || 1, 10);
            if (!weapon || !AMMO_PACKS[weapon]) return await m.reply(`❌ Unknown weapon. Available: ${Object.keys(AMMO_PACKS).join(', ')}`);
            if (!(gta.weapons||[]).includes(weapon)) return await m.reply(`❌ You don't own a ${weapon}. Buy it first with ${bot.prefix}weapons buy ${weapon}`);
            const cost = AMMO_PACKS[weapon].price * packs;
            const db   = loadDB(); const user = getUser(db, m.sender);
            if ((user.wallet||0) < cost) return await m.reply(`❌ Need 🪙${fmt(cost)}\nYou have: 🪙${fmt(user.wallet||0)}`);
            user.wallet -= cost;
            user.stats.spent = (user.stats.spent || 0) + cost;
            saveDB(db);
            if (!gta.ammo) gta.ammo = {};
            gta.ammo[weapon] = (gta.ammo[weapon] || 0) + (AMMO_PACKS[weapon].perPack * packs);
            saveGtaUser(m.sender, gta);
            return await m.reply(`✅ Bought ${packs} pack(s) of ${weapon} ammo!\n+${AMMO_PACKS[weapon].perPack * packs} bullets\nCost: 🪙${fmt(cost)}\nTotal ${weapon} ammo: ${gta.ammo[weapon]}`);
        }
    }
};
