const { getTarget, resolveTargets } = require('../../lib/getTarget');
const { loadDB, saveDB, getUser, onCooldown, setCooldown, formatCooldown, addXP, hasItem, removeItem, fmt, CURRENCY } = require('../../lib/economyEngine');

const COOLDOWN = 45 * 60 * 1000; // 45 minutes

function cleanJid(jid) {
    if (!jid) return '';
    return jid.replace(/:[0-9]+@/, '@');
}

module.exports = {
    name: 'rob',
    category: 'economy',
    reactions: { start: '⚙️' },
    description: 'Rob another user — risk of backfire. Usage: .rob @user',

    async execute(bot, m, args) {
        const db = loadDB();
        const user = getUser(db, m.sender);

        const targetJid = getTarget(m);
        if (!targetJid) return await m.reply(`Usage: *.rob @user*\nTag someone in the group to rob them.`);
        const targetJids = await resolveTargets(bot, m);
        if (targetJids.includes(cleanJid(m.sender))) return await m.reply(`❌ You can't rob yourself!`);

        const wait = onCooldown(user, 'rob', COOLDOWN);
        if (wait) return await m.reply(`⏳ You're being watched by the police!\nTry again in *${formatCooldown(wait)}*.`);

        setCooldown(user, 'rob');

        const targetAccountJid =
            targetJids.find(jid => jid.endsWith('@s.whatsapp.net') && db[jid]) ||
            targetJids.find(jid => db[jid]) ||
            targetJid;
        const target = getUser(db, targetAccountJid);

        // Target has a shield — rob blocked
        if (hasItem(target, 'shield')) {
            removeItem(target, 'shield');
            user.nerve = Math.max(0,(user.nerve??100)-15);
            saveDB(db);
            return await m.reply(`🛡️ *ROB BLOCKED!*\n─────────────\n@${targetJid.split('@')[0]} had a *Shield* equipped!\nYour rob attempt failed and their shield broke.`);
        }

        if (target.wallet < 50) return await m.reply(`💀 *ROB FAILED*\n─────────────\n@${targetJid.split('@')[0]} is too broke to rob. They only have *${fmt(target.wallet)}* ${CURRENCY}.`);

        // Lockpick gives +20% success chance
        const hasLockpick = hasItem(user, 'lockpick');
        const baseSuccess = 0.45;
        const successChance = hasLockpick ? baseSuccess + 0.20 : baseSuccess;
        if (hasLockpick) {
            removeItem(user, 'lockpick');
        }

        const success = Math.random() < successChance;

        if (!success) {
            // Robber loses coins as fine
            const fine = Math.floor(Math.random() * 200) + 100;
            const actual = Math.min(fine, user.wallet);
            user.wallet = Math.max(0, user.wallet - actual);
            user.stats.lost = (user.stats.lost || 0) + actual;
            saveDB(db);
            return await m.reply(`🚨 *ROB FAILED!*\n─────────────\nYou were caught trying to rob @${targetJid.split('@')[0]}!\nPolice fined you: -*${fmt(actual)}* ${CURRENCY}\n💼 Your Balance: *${fmt(user.wallet)}* ${CURRENCY}`);
        }

        const stolen = Math.floor(target.wallet * (Math.random() * 0.3 + 0.1)); // steal 10–40%
        target.wallet -= stolen;
        user.wallet += stolen;
        user.stats.earned = (user.stats.earned || 0) + stolen;
        target.stats.lost = (target.stats.lost || 0) + stolen;
        addXP(user, 35);
        saveDB(db);

        await m.reply(`🦹 *ROB SUCCESSFUL!*\n─────────────\nYou robbed @${targetJid.split('@')[0]}!\nStolen: +*${fmt(stolen)}* ${CURRENCY}\n💼 Your Balance: *${fmt(user.wallet)}* ${CURRENCY}`);
    }
};
