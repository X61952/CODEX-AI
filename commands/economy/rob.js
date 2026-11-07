const { getTarget, resolveTargets } = require('../../lib/getTarget');
const { loadDB, saveDB, getUser, addXP, hasItem, removeItem, fmt, CURRENCY } = require('../../lib/economyEngine');
const { getGtaUser, addWantedStars, getWantedLabel } = require('../../lib/gtaEngine');

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
        if (!targetJid) return await m.reply(`Usage: .rob @user`);
        const targetJids = await resolveTargets(bot, m);
        if (targetJids.includes(cleanJid(m.sender))) return await m.reply(`You can't rob yourself.`);

        const currentWantedStars = getGtaUser(m.sender).wantedStars || 0;
        const fineMultiplier = 1 + currentWantedStars * 0.1;
        let wantedStars = addWantedStars(m.sender, 1);

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
            return await m.reply(`Rob failed. The target's shield blocked it and broke.\nWanted: ${getWantedLabel(wantedStars)}.`);
        }

        if (target.wallet < 50) return await m.reply(`Rob failed. Target wallet is below 50 ${CURRENCY}.\nWanted: ${getWantedLabel(wantedStars)}.`);

        // Lockpick gives +20% success chance
        const hasLockpick = hasItem(user, 'lockpick');
        const baseSuccess = 0.45;
        const successChance = Math.max(
            0.05,
            baseSuccess - currentWantedStars * 0.05 + (hasLockpick ? 0.20 : 0)
        );
        if (hasLockpick) {
            removeItem(user, 'lockpick');
        }

        const success = Math.random() < successChance;

        if (!success) {
            wantedStars = addWantedStars(m.sender, 1);
            // Robber loses coins as fine
            const baseFine = Math.floor(Math.random() * 200) + 100;
            const fine = Math.floor(baseFine * fineMultiplier);
            const actual = Math.min(fine, user.wallet);
            user.wallet = Math.max(0, user.wallet - actual);
            user.stats.lost = (user.stats.lost || 0) + actual;
            saveDB(db);
            return await m.reply(`Rob failed. Fine: *${fmt(actual)}* ${CURRENCY}.\nWanted: ${getWantedLabel(wantedStars)}.\nWallet: *${fmt(user.wallet)}* ${CURRENCY}.`);
        }

        const stolen = Math.floor(target.wallet * (Math.random() * 0.3 + 0.1)); // steal 10–40%
        target.wallet -= stolen;
        user.wallet += stolen;
        user.stats.earned = (user.stats.earned || 0) + stolen;
        target.stats.lost = (target.stats.lost || 0) + stolen;
        addXP(user, 35);
        saveDB(db);

        await m.reply(`Rob successful. Stole *${fmt(stolen)}* ${CURRENCY}.\nWanted: ${getWantedLabel(wantedStars)}.\nWallet: *${fmt(user.wallet)}* ${CURRENCY}.`);
    }
};
