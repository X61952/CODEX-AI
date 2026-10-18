// Auto Leave (plugin) — when ON, the bot leaves any group it is added to.
//
//   .autoleave on      turn it on
//   .autoleave off     turn it off
//   .autoleave         show the current state
//
// When someone adds the bot to a group it sends:   _Leaving now..._
// and leaves straight away. Groups the bot is ALREADY in are never touched —
// only fresh adds trigger it. Owner-only command. Applies to everyone who
// adds the bot (the owner included) while it is ON; a group the owner joins
// with .join is left alone because that join was deliberate.
//
// Hooked from app.js#handleGroupUpdate (group-participants.update 'add' for
// the bot itself) and lib/connection.js (groups.upsert). State lives in
// database/autoleave.json so it survives restarts.
'use strict';

const fs = require('fs-extra');

const DB = './database/autoleave.json';
const LEAVE_TEXT = '_Leaving now..._';

const handled = new Map();   // groupId -> time handled (dedupes the two events)

function isEnabled() {
    try { return JSON.parse(fs.readFileSync(DB, 'utf8')).enabled === true; }
    catch { return false; }
}

function setEnabled(on) {
    fs.ensureDirSync('./database');
    fs.writeFileSync(DB, JSON.stringify({ enabled: !!on }, null, 2));
}

async function leaveGroup(bot, groupId) {
    const now = Date.now();
    for (const [k, t] of handled) if (now - t > 5 * 60 * 1000) handled.delete(k);
    if (handled.has(groupId)) return true;
    handled.set(groupId, now);

    // Give a deliberate .join a moment to register itself first.
    await new Promise((r) => setTimeout(r, 1500));
    const joinedOn = bot._joinedByCommand?.get(groupId);
    if (joinedOn && Date.now() - joinedOn < 30 * 1000) return false;

    try { await bot.sock.sendMessage(groupId, { text: LEAVE_TEXT }); } catch {}
    try {
        await bot.sock.groupLeave(groupId);
    } catch (e) {
        console.error('[AutoLeave] groupLeave failed:', e.message);
        handled.delete(groupId);   // allow a retry on the next event
    }
    return true;
}

// group-participants.update 'add' — true when the bot itself was added (and left).
async function onGroupJoin(bot, groupId, participants) {
    if (!isEnabled()) return false;
    const botWasAdded = (participants || []).some((p) => {
        const ids = typeof p === 'string' ? [p] : [p?.id, p?.jid, p?.lid, p?.phoneNumber];
        return ids.some((id) => id && bot.permission?.isBotSelf(id));
    });
    if (!botWasAdded) return false;
    return await leaveGroup(bot, groupId);
}

// groups.upsert — only trusted well after (re)connect: right after connecting
// WhatsApp may replay groups the bot has been in for ages.
async function onGroupUpsert(bot, group) {
    if (!isEnabled() || !group?.id) return false;
    if (!bot._openAt || Date.now() - bot._openAt < 2 * 60 * 1000) return false;
    const inGroup = (group.participants || []).some((p) => {
        const ids = [p?.id, p?.jid, p?.lid, p?.phoneNumber];
        return ids.some((id) => id && bot.permission?.isBotSelf(id));
    });
    if (!inGroup) return false;
    return await leaveGroup(bot, group.id);
}

module.exports = {
    name: 'autoleave',
    aliases: ['autoleavegc', 'leaveonadd'],
    category: 'owner',
    reactions: { start: '🚪' },
    description: 'Auto leave: when on, the bot leaves any group it is added to',
    ownerOnly: true,

    async execute(bot, m, args) {
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'on')  { setEnabled(true);  return await m.reply('Auto leave is now ON. I will leave any group I am added to.'); }
        if (sub === 'off') { setEnabled(false); return await m.reply('Auto leave is now OFF.'); }
        return await m.reply(`Auto leave is ${isEnabled() ? 'ON' : 'OFF'}.\n\nUsage:\n${bot.prefix}autoleave on\n${bot.prefix}autoleave off`);
    },

    onGroupJoin,
    onGroupUpsert,
    isEnabled,
};
