'use strict';

const G = require('../../lib/greetings');
const tz = require('../../lib/timezone');

const SLOT_ALIASES = {
    morning: 'morning', am: 'morning', m: 'morning',
    afternoon: 'afternoon', noon: 'afternoon', pm: 'afternoon', a: 'afternoon',
    evening: 'evening', eve: 'evening', e: 'evening',
    night: 'night', n: 'night',
};

const RULE = '━━━━━━━━━━━━━━━━━━';
const SLOT_WORDS = '<morning|afternoon|evening|night>';

/** The group a command is about: the current group, or a group JID given as an argument. */
function targetGroup(m, args) {
    if (m.isGroup) return m.chat;
    const jid = args.find(a => G.isGroupJid(String(a).trim()));
    return jid ? String(jid).trim() : null;
}

async function groupName(bot, jid) {
    try {
        const meta = await require('../../lib/groupMetaCache').get(bot, jid);
        return meta?.subject || jid;
    } catch {
        return jid;
    }
}

async function panel(bot, m, settings) {
    const zone = G.currentZone(settings);
    const p = G.zonedParts(new Date(), zone);
    const usingOverride = Boolean(settings.tz && tz.normalize(settings.tz));
    const P = bot.prefix || '.';
    const groups = G.enabledGroups(settings);

    const schedule = G.SLOTS
        .map(slot => `${G.META[slot].emoji} ${G.META[slot].label.padEnd(10)} ${G.slotLabelTime(settings, slot)}`)
        .join('\n');

    let here = '';
    if (m.isGroup) {
        const g = settings.groups[m.chat];
        here = `This group  ${g?.enabled ? '✅ *ON*' : '❌ *OFF*'}\n`;
    }

    const jid = G.ownerJid(bot);
    return [
        '🌅 *OWNER GREETINGS*',
        RULE,
        `Greets      owner${jid ? ` (@${jid.split('@')[0]})` : ''}`,
        `Card name   ${G.ownerName(bot, settings) || '_not set_'}`,
        here + `Groups on   *${groups.length}*`,
        `Card        ${settings.card ? 'photo card + caption' : 'text only'}`,
        '',
        '⏰ *Schedule*',
        '```',
        schedule,
        '```',
        `🌍 *${tz.label(zone)}*${usingOverride ? ' _(greetings override)_' : ' _(bot timezone)_'}`,
        `🕒 Now: ${G.clock12(p.hour, p.minute)}`,
        RULE,
        `*${P}greetings on* / *off*  _(send it inside the group)_`,
        `*${P}greetings groups*  _(list the groups that get greetings)_`,
        `*${P}greetings test* [${SLOT_WORDS.slice(1, -1)}]`,
        `*${P}greetings name* <your name>  _(shown on the card)_`,
        `*${P}greetings time* ${SLOT_WORDS} <time>`,
        `*${P}greetings tz* <zone>  (e.g. Africa/Lagos)`,
        `*${P}greetings card* on / off`,
        `*${P}gpreview* ${SLOT_WORDS.replace('>', '|all>')}  _(works in DM too)_`,
    ].join('\n');
}

module.exports = {
    name: 'greetings',
    aliases: ['greeting', 'greet'],
    category: 'owner',
    reactions: { start: '🌅' },
    description: 'Greet the owner (tagged) in chosen groups every morning, afternoon, evening and night (timezone aware).',
    usage: '.greetings on | off | status | groups | test | name | time | tz | card',
    ownerOnly: true,

    async execute(bot, m, args) {
        // Using the command also makes sure the scheduler is running.
        G.ensureRunning(bot);

        const P = bot.prefix || '.';
        const sub = String(args[0] || 'status').toLowerCase();
        const rest = args.slice(1);

        switch (sub) {
            case 'on': case 'enable': case 'start': {
                const jid = targetGroup(m, rest);
                if (!jid) return m.reply(`👥 The greeting for you is posted in the *groups* you choose.\nSend *${P}greetings on* inside the group you want, or from here use:\n*${P}greetings on <group id>*  _(ends with @g.us)_`);
                G.update(s => { if (!s.name && m.pushName) s.name = G.cleanName(m.pushName); });
                const settings = G.enableGroup(jid);
                const name = m.isGroup ? '' : ` for *${await groupName(bot, jid)}*`;
                const times = G.SLOTS.map(s => `${G.META[s].emoji} ${G.META[s].label} ${G.slotLabelTime(settings, s)}`).join('\n');
                return m.reply(`✅ *Greetings enabled*${name}\n${RULE}\n${times}\n${RULE}\n_Try it now with_ *${P}greetings test*\n_Turn it off with_ *${P}greetings off*`);
            }

            case 'off': case 'disable': case 'stop': {
                const jid = targetGroup(m, rest);
                if (!jid) return m.reply(`Send *${P}greetings off* inside the group, or *${P}greetings off <group id>* from here.`);
                G.disableGroup(jid);
                return m.reply(`❌ *Greetings disabled*${m.isGroup ? '' : ` for *${await groupName(bot, jid)}*`}\n_Turn them back on with_ *${P}greetings on*`);
            }

            case 'status': case 'info': case 'help':
                return m.reply(await panel(bot, m, G.readSettings()));

            case 'groups': case 'list': {
                const list = G.enabledGroups();
                if (!list.length) return m.reply(`No group has greetings yet.\nSend *${P}greetings on* inside a group to start.`);
                const names = [];
                for (const jid of list.slice(0, 40)) names.push(await groupName(bot, jid));
                const lines = names.map((n, i) => `${i + 1}. ${n}`).join('\n');
                return m.reply(`👥 *Groups with greetings* (${list.length})\n${RULE}\n${lines}${list.length > 40 ? `\n…and ${list.length - 40} more` : ''}`);
            }

            case 'test': {
                const slot = SLOT_ALIASES[String(rest[0] || 'morning').toLowerCase()];
                if (!slot) return m.reply(`Choose one: *morning*, *afternoon*, *evening* or *night*.\nExample: ${P}greetings test evening`);
                try {
                    // In a group this is the real greeting; in DM it is a preview.
                    await G.sendGreeting(bot, slot, m.chat, { preview: !m.isGroup });
                } catch (err) {
                    return m.reply(`⚠️ Could not send the test: ${err.message}`);
                }
                return;
            }

            case 'name': {
                const value = rest.join(' ').trim();
                if (!value) return m.reply(`Usage: *${P}greetings name* <your name>\nThis name is written on the greeting card.\nUse *${P}greetings name reset* to go back to the owner name in the config.`);
                if (['reset', 'default', 'off'].includes(value.toLowerCase())) {
                    G.update(s => { s.name = ''; });
                    return m.reply('✅ Card name reset to the owner name from the config.');
                }
                const name = G.cleanName(value);
                if (!name) return m.reply('❌ That name is not valid.');
                G.update(s => { s.name = name; });
                return m.reply(`✅ The greeting card will now carry the name *${name}*`);
            }

            case 'tz': case 'timezone': case 'zone': {
                const value = rest.join(' ').trim();
                if (!value) {
                    const settings = G.readSettings();
                    return m.reply(`🌍 Greetings timezone: *${tz.label(G.currentZone(settings))}*\n\n_Change it with_ *${P}greetings tz Africa/Lagos*\n_The bot-wide zone is set with_ *${P}setvar TIME_ZONE=Africa/Lagos*\n_Use_ *${P}greetings tz reset* _to follow the bot timezone._`);
                }
                if (['reset', 'default', 'bot'].includes(value.toLowerCase())) {
                    const settings = G.update(s => { s.tz = ''; });
                    return m.reply(`✅ Greetings now follow the bot timezone: *${tz.label(G.currentZone(settings))}*`);
                }
                const zone = tz.normalize(value);
                if (!zone) return m.reply(`❌ "${value}" is not a valid timezone.\nTry *Africa/Lagos*, *America/New_York*, *Europe/London* or *UTC+1*.`);
                G.update(s => { s.tz = zone; });
                void G.tick(bot);
                return m.reply(`✅ Greetings timezone set to *${tz.label(zone)}*`);
            }

            case 'time': case 'set': {
                const slot = SLOT_ALIASES[String(rest[0] || '').toLowerCase()];
                const clock = G.parseClock(rest.slice(1).join(' '));
                if (!slot || !clock) {
                    return m.reply(`Usage: *${P}greetings time* ${SLOT_WORDS} <time>\nExamples:\n${P}greetings time morning 6:30am\n${P}greetings time night 23:00`);
                }
                const settings = G.update(s => {
                    s.times[slot] = clock;
                    for (const g of Object.values(s.groups)) if (g?.lastSent) delete g.lastSent[slot];
                });
                return m.reply(`✅ ${G.META[slot].emoji} *${G.META[slot].label}* greeting moved to *${G.slotLabelTime(settings, slot)}*`);
            }

            case 'card': case 'image': {
                const v = String(rest[0] || '').toLowerCase();
                if (!['on', 'off'].includes(v)) return m.reply(`Usage: *${P}greetings card on|off*`);
                G.update(s => { s.card = v === 'on'; });
                return m.reply(v === 'on' ? '🖼️ Greeting cards *enabled*.' : '📝 Greetings will be sent as *text only*.');
            }

            default:
                return m.reply(await panel(bot, m, G.readSettings()));
        }
    },
};
                                        
