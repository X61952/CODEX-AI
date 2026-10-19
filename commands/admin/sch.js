/**
 * .sch — Daily recurring schedule command (node-cron, survives restarts)
 *
 * Usage:
 *   .sch -mute 1am to 6am daily         → mutes group at 1am, unmutes at 6am, every day
 *   .sch -unmute 1am to 6am daily       → unmutes at 1am, mutes at 6am
 *   .sch -muteuser @user 1am to 6am daily
 *   .sch -unmuteuser @user 1am to 6am daily
 *   .sch -permit ping 6pm to 9pm daily   → (owner/mod) opens .ping to everyone every day
 *   .sch -permit economy 6pm to 9pm daily   (global — all groups; see lib/permit.js)
 *   .sch -ban @user 6pm to 9pm daily     → (owner/mod) bans a user from the bot every day in that window
 *   .sch -unban @user 6pm to 9pm daily   → (owner/mod) the user is unbanned in that window and banned the rest of the day
 *   .sch list                            → list schedules for this chat
 *   .sch clear                           → cancel all schedules for this chat
 *
 * Times: 1am | 6pm | 6:30pm | 23:00  (bot timezone — .setvar TIME_ZONE=Africa/Lagos)
 */
const { getTarget }                                        = require('../../lib/getTarget');
const { parseTimeOfDay, humanize, addRecurring, cancelRecurring, listRecurring } = require('../../lib/mute-core');

module.exports = {
    name: 'sch',
    aliases: ['schedule', 'sched'],
    category: 'admin',
    reactions: { start: '⚙️' },
    description: 'Set a daily recurring mute/unmute schedule',
    adminOnly: true,
    groupOnly: true,

    async execute(bot, m, args) {
        const jid = m.chat;
        const a0  = (args[0] || '').toLowerCase();
        const P   = bot.prefix;

        // ── list ─────────────────────────────────────────────────────────────
        if (a0 === 'list') {
            const jobs = listRecurring(jid);
            if (!jobs.length) return m.reply('📅 No recurring schedules set for this chat.');
            const lines = jobs.map((j, i) => {
                const fr = `${j.timeFrom.hour.toString().padStart(2,'0')}:${j.timeFrom.minute.toString().padStart(2,'0')}`;
                const to = `${j.timeTo.hour.toString().padStart(2,'0')}:${j.timeTo.minute.toString().padStart(2,'0')}`;
                const who = j.target ? ` @${j.target.split('@')[0]}` : '';
                return `${i+1}. ${j.type.replace('sch-','.')}${who} ${fr} → ${to} daily`;
            });
            return m.reply(`📅 *Recurring Schedules:*\n\n${lines.join('\n')}\n\nUse ${P}sch clear to remove all.`);
        }

        // ── clear ─────────────────────────────────────────────────────────────
        if (a0 === 'clear') {
            cancelRecurring(jid);
            return m.reply('🗑️ All recurring schedules cleared for this chat.');
        }

        // ── -permit <cmd|category> <from> to <to> daily ───────────────────────
        // Global (all groups) and owner/mod only. Windows live under the pseudo
        // chat "permit", so .sch clear in a group never touches them —
        // use `.list permit` / `.clear permit` / `.permit remove <cmd>` instead.
        if (a0 === '-permit' || a0 === 'permit') {
            const isPriv = m.key?.fromMe || bot.permission.isOwner(m.sender) || bot.permission.isMod(m.sender, m._participantRaw);
            if (!isPriv) return m.reply('❌ Owner/mod only — permits apply to every group.');

            const permit = require('../../lib/permit');
            const usage = `${P}sch -permit ping 6pm to 9pm daily\n${P}sch -permit economy 6pm to 9pm daily`;
            if (!args[1]) return m.reply(`📅 *Scheduled permit*\n\n*Usage:*\n${usage}\n\n_Opens the command to everyone (all groups) during that window, every day (Nigeria time)._`);

            const res = permit.resolveTarget(bot, args[1]);
            if (!res.ok) return m.reply(`❌ ${res.error}`);

            const ptext  = args.slice(2).join(' ');
            const pMatch = ptext.match(/(.+?)\s+to\s+(.+?)(?:\s+daily)?$/i);
            if (!pMatch) return m.reply(`Couldn't parse time range. Example:\n${P}sch -permit ${res.name} 6pm to 9pm daily`);

            const pFrom = parseTimeOfDay(pMatch[1].trim());
            const pTo   = parseTimeOfDay(pMatch[2].trim());
            if (!pFrom) return m.reply(`Couldn't parse start time: "${pMatch[1].trim()}"\nExamples: 1am, 6:30pm, 23:00`);
            if (!pTo)   return m.reply(`Couldn't parse end time: "${pMatch[2].trim()}"\nExamples: 6am, 18:30, 08:00`);
            if (pFrom.hour === pTo.hour && pFrom.minute === pTo.minute) return m.reply('⚠️ Start and end time can\'t be the same.');

            permit.addWindow({ target: res, by: m.sender, timeFrom: pFrom, timeTo: pTo });
            const off = permit.isEnabled() ? '' : `\n\n⚠️ The permit system is currently *OFF* — use ${P}permit on.`;
            return m.reply(`✅ *Scheduled permit created!*\n\n🔓 ${res.type === 'cat' ? `All *${res.name}* commands` : `*${res.label}*`} will be open to *everyone* (all groups) from *${permit.hhmm(pFrom)}* to *${permit.hhmm(pTo)}* every day (Nigeria time).\n\nUse ${P}list permit to view or ${P}permit remove ${res.name} to remove.${off}`);
        }

        // ── -ban @user <from> to <to> daily ───────────────────────────────────
        // Global (all groups) and owner/mod only. Like permits, these windows live
        // under the pseudo chat "ban", so .sch list / .sch clear never touch them —
        // use `.ban list` / `.unban @user` instead (see lib/banStore.js).
        if (a0 === '-ban' || a0 === 'ban' || a0 === '-unban' || a0 === 'unban') {
            const isUnban = a0 === '-unban' || a0 === 'unban';
            const isPriv = m.key?.fromMe || bot.permission.isOwner(m.sender) || bot.permission.isMod(m.sender, m._participantRaw);
            if (!isPriv) return m.reply('❌ Owner/mod only — bans apply to every group.');

            const banStore = require('../../lib/banStore');
            const usage = `${P}sch ${isUnban ? '-unban' : '-ban'} @user 6pm to 9pm daily`;
            const t = await banStore.targetFromMessage(bot, m, args.slice(1));
            if (!t) return m.reply(`📅 *Scheduled ${isUnban ? 'unban' : 'ban'}*\n\n*Usage:*\n${usage}\n(or reply to the user's message)\n\n_${isUnban ? 'Unbans the user during that window and bans them the rest of the day' : 'Bans the user from the bot during that window'}, every day, in all groups (Nigeria time)._`);

            const why = banStore.protectedReason(bot, t.forms);
            if (why) return m.reply(`⛔ ${why}`);

            const bText  = t.rest.join(' ');
            const bMatch = bText.match(/(.+?)\s+to\s+(.+?)(?:\s+daily)?$/i);
            if (!bMatch) return m.reply(`Couldn't parse time range. Example:\n${usage}`);

            const bFrom = parseTimeOfDay(bMatch[1].trim());
            const bTo   = parseTimeOfDay(bMatch[2].trim());
            if (!bFrom) return m.reply(`Couldn't parse start time: "${bMatch[1].trim()}"\nExamples: 1am, 6:30pm, 23:00`);
            if (!bTo)   return m.reply(`Couldn't parse end time: "${bMatch[2].trim()}"\nExamples: 6am, 18:30, 08:00`);
            if (bFrom.hour === bTo.hour && bFrom.minute === bTo.minute) return m.reply('⚠️ Start and end time can\'t be the same.');

            banStore.addWindow({ jid: t.jid, forms: t.forms, by: m.sender, timeFrom: bFrom, timeTo: bTo, kind: isUnban ? 'unban' : 'ban' });
            return m.reply(
                isUnban
                    ? `✅ *Scheduled unban created!*\n\n🔓 @${t.jid.split('@')[0]} will be *unbanned* from *${banStore.hhmm(bFrom)}* to *${banStore.hhmm(bTo)}* every day and *banned* the rest of the time (all groups, Nigeria time).\n\nUse ${P}ban list to view or ${P}unban @user to remove.`
                    : `✅ *Scheduled ban created!*\n\n🔨 @${t.jid.split('@')[0]} will be banned from the bot (all groups) from *${banStore.hhmm(bFrom)}* to *${banStore.hhmm(bTo)}* every day (Nigeria time).\n\nUse ${P}ban list to view or ${P}unban @user to remove.`,
                { mentions: [t.jid] },
            );
        }

        // ── parse -type [target] <from> to <to> daily ─────────────────────────
        const typeMap = {
            '-mute':        'sch-muteGroup',
            '-unmute':      'sch-unmuteGroup',
            '-muteuser':    'sch-muteUser',
            'muteuser':     'sch-muteUser',
            'user':         'sch-muteUser',
            '-unmuteuser':  'sch-unmuteUser',
            'unmuteuser':   'sch-unmuteUser',
            '-dnd':         'sch-dnd',
            'dnd':          'sch-dnd',
        };
        const type = typeMap[a0];
        if (!type) {
            return m.reply(
`📅 *Schedule Command*

*Usage:*
${P}sch -mute 1am to 6am daily
${P}sch -unmute 1am to 6am daily
${P}sch -muteuser @user 1am to 6am daily   (or: ${P}sch user @user 1am to 6am daily)
${P}sch -unmuteuser @user 1am to 6am daily (or: ${P}sch unmuteuser @user 1am to 6am daily)
${P}sch -dnd 12am to 6pm daily             (or: ${P}sch dnd 12am to 6pm daily)
${P}sch -permit ping 6pm to 9pm daily      (owner/mod — opens a command to everyone)
${P}sch -ban @user 6pm to 9pm daily        (owner/mod — bans a user from the bot in that window)
${P}sch -unban @user 6pm to 9pm daily      (owner/mod — user is unbanned in that window, banned the rest of the day)
${P}sch list
${P}sch clear

_Times: 1am, 6pm, 6:30pm, 23:00 (Nigeria time)_`
            );
        }

        const needsTarget = type === 'sch-muteUser' || type === 'sch-unmuteUser';
        let target = null;
        if (needsTarget) {
            target = getTarget(m);
            if (!target) return m.reply(`Reply to a user's message or tag them:\n${P}sch ${a0} @user 1am to 6am daily`);
        }

        // Extract times — find "X to Y" pattern in remaining args
        const remainingArgs = args.slice(1).filter(a => !a.startsWith('@'));
        const text = remainingArgs.join(' ');
        const toMatch = text.match(/(.+?)\s+to\s+(.+?)(?:\s+daily)?$/i);
        if (!toMatch) {
            return m.reply(`Couldn't parse time range. Example:\n${P}sch ${a0} 1am to 6am daily`);
        }

        const timeFrom = parseTimeOfDay(toMatch[1].trim());
        const timeTo   = parseTimeOfDay(toMatch[2].trim());

        if (!timeFrom) return m.reply(`Couldn't parse start time: "${toMatch[1].trim()}"\nExamples: 1am, 6:30pm, 23:00`);
        if (!timeTo)   return m.reply(`Couldn't parse end time: "${toMatch[2].trim()}"\nExamples: 6am, 18:30, 08:00`);

        const id = addRecurring({ chat: jid, target, mutedBy: m.sender, type, timeFrom, timeTo });

        const frStr = `${timeFrom.hour.toString().padStart(2,'0')}:${timeFrom.minute.toString().padStart(2,'0')}`;
        const toStr = `${timeTo.hour.toString().padStart(2,'0')}:${timeTo.minute.toString().padStart(2,'0')}`;
        const who   = target ? ` @${target.split('@')[0]}` : '';
        const desc  = {
            'sch-muteGroup':   `Group will be *muted* at ${frStr} and *unmuted* at ${toStr} every day (Nigeria time).`,
            'sch-unmuteGroup': `Group will be *unmuted* at ${frStr} and *muted* at ${toStr} every day (Nigeria time).`,
            'sch-muteUser':    `${who} will be *muted* at ${frStr} and *unmuted* at ${toStr} every day (Nigeria time).`,
            'sch-unmuteUser':  `${who} will be *unmuted* at ${frStr} and *muted* at ${toStr} every day (Nigeria time).`,
            'sch-dnd':         `DND will turn *ON* at ${frStr} and *OFF* at ${toStr} every day (Nigeria time).`,
        }[type];

        return m.reply(`✅ *Schedule created!*\n\n📅 ${desc}\n\nUse ${P}sch list to view or ${P}sch clear to remove.`);
    }
};


