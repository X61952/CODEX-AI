'use strict';

const G = require('../../lib/greetings');
const tz = require('../../lib/timezone');

const SLOT_ALIASES = {
    morning: 'morning', am: 'morning', m: 'morning',
    afternoon: 'afternoon', noon: 'afternoon', pm: 'afternoon', a: 'afternoon',
    night: 'night', n: 'night', evening: 'night',
};

const RULE = '━━━━━━━━━━━━━━━━━━';

function panel(bot, settings) {
    const zone = G.currentZone(settings);
    const p = G.zonedParts(new Date(), zone);
    const usingOverride = Boolean(settings.tz && tz.normalize(settings.tz));
    const jid = G.ownerJid(bot);
    const P = bot.prefix || '.';

    const schedule = G.SLOTS
        .map(slot => `${G.META[slot].emoji} ${G.META[slot].label.padEnd(10)} ${G.slotLabelTime(settings, slot)}`)
        .join('\n');

    const designs = G.SLOTS
        .map(slot => {
            const pref = settings.designs?.[slot] ?? 'rotate';
            const n = Number(pref);
            const text = Number.isInteger(n) && n >= 1 && n <= G.DESIGNS[slot].length
                ? `#${n} ${G.DESIGNS[slot][n - 1]}`
                : `${pref === 'random' ? 'random' : 'rotates daily'} (${G.DESIGNS[slot].length})`;
            return `${G.META[slot].emoji} ${G.META[slot].label.padEnd(10)} ${text}`;
        })
        .join('\n');

    return [
        '🌅 *GREETINGS*',
        RULE,
        `Status   ${settings.enabled ? '✅ *ON*' : '❌ *OFF*'}`,
        `Sent to  owner only${jid ? ` (@${jid.split('@')[0]})` : ''}`,
        `Name     ${settings.name || '_your WhatsApp mention_'}`,
        `Card     ${settings.card ? 'image card + caption' : 'text only'}`,
        '',
        '⏰ *Schedule*',
        '```',
        schedule,
        '```',
        '🎨 *Designs*',
        '```',
        designs,
        '```',
        `🌍 *${tz.label(zone)}*${usingOverride ? ' _(greetings override)_' : ' _(bot timezone)_'}`,
        `🕒 Now: ${G.clock12(p.hour, p.minute)}`,
        RULE,
        `*${P}greetings on* / *off*`,
        `*${P}greetings test* [morning|afternoon|night]`,
        `*${P}greetings name* <text>`,
        `*${P}greetings time* <slot> <time>`,
        `*${P}greetings design* <slot> <1-4|rotate|random>`,
        `*${P}gpreview* <morning|afternoon|night>`,
        `*${P}greetings tz* <zone>  (e.g. Africa/Lagos)`,
        `*${P}greetings card* on / off`,
    ].join('\n');
}

module.exports = {
    name: 'greetings',
    aliases: ['greeting', 'greet'],
    category: 'owner',
    reactions: { start: '🌅' },
    description: 'Greet the owner every morning, afternoon and night (timezone aware).',
    usage: '.greetings on | off | status | test | name | time | design | tz | card',
    ownerOnly: true,

    async execute(bot, m, args) {
        // Using the command also makes sure the scheduler is running.
        G.ensureRunning(bot);

        const P = bot.prefix || '.';
        const sub = String(args[0] || 'status').toLowerCase();
        const rest = args.slice(1);

        switch (sub) {
            case 'on': case 'enable': case 'start': {
                const settings = G.update(s => {
                    s.enabled = true;
                    if (!s.name && m.pushName) s.name = String(m.pushName).trim().slice(0, 28);
                });
                return m.reply(`✅ *Greetings enabled*\n\n${panel(bot, settings)}`);
            }

            case 'off': case 'disable': case 'stop': {
                const settings = G.update(s => { s.enabled = false; });
                return m.reply(`❌ *Greetings disabled*\n\n_Turn them back on with_ *${P}greetings on*\n\n${panel(bot, settings)}`);
            }

            case 'status': case 'info': case 'help':
                return m.reply(panel(bot, G.readSettings()));

            case 'test': {
                const slot = SLOT_ALIASES[String(rest[0] || 'morning').toLowerCase()];
                if (!slot) return m.reply(`Choose one: *morning*, *afternoon* or *night*.\nExample: ${P}greetings test night`);
                try {
                    await G.sendGreeting(bot, slot);
                    return m.reply(`🧪 Sent a *${G.META[slot].label.toLowerCase()}* greeting to the owner number.`);
                } catch (err) {
                    return m.reply(`⚠️ Could not send the test: ${err.message}`);
                }
            }

            case 'name': {
                const value = rest.join(' ').trim();
                if (!value) return m.reply(`Usage: *${P}greetings name* <your name>\nUse *${P}greetings name reset* to go back to a WhatsApp mention.`);
                if (['reset', 'default', 'off'].includes(value.toLowerCase())) {
                    G.update(s => { s.name = ''; });
                    return m.reply('✅ Name cleared. Greetings now mention your WhatsApp contact.');
                }
                const name = value.slice(0, 28);
                G.update(s => { s.name = name; });
                return m.reply(`✅ Greetings will now say *GOOD MORNING @${name}*`);
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
                    return m.reply(`Usage: *${P}greetings time* <morning|afternoon|night> <time>\nExamples:\n${P}greetings time morning 6:30am\n${P}greetings time night 23:00`);
                }
                const settings = G.update(s => { s.times[slot] = clock; delete s.lastSent[slot]; });
                return m.reply(`✅ ${G.META[slot].emoji} *${G.META[slot].label}* greeting moved to *${G.slotLabelTime(settings, slot)}*`);
            }

            case 'design': case 'designs': case 'style': {
                const slot = SLOT_ALIASES[String(rest[0] || '').toLowerCase()];
                if (!slot) {
                    const list = G.SLOTS
                        .map(sl => `${G.META[sl].emoji} *${G.META[sl].label}*\n${G.DESIGNS[sl].map((n, i) => `  ${i + 1}. ${n}`).join('\n')}`)
                        .join('\n\n');
                    return m.reply(`🎨 *Greeting designs*\n${RULE}\n${list}\n${RULE}\nPick one: *${P}greetings design morning 1*\nOr: *${P}greetings design morning rotate* / *random*\nSee it first: *${P}gpreview morning 1*`);
                }
                const choice = String(rest[1] || '').toLowerCase();
                const n = Number(choice);
                const count = G.DESIGNS[slot].length;
                let value;
                if (choice === 'rotate' || choice === 'daily') value = 'rotate';
                else if (choice === 'random' || choice === 'shuffle') value = 'random';
                else if (Number.isInteger(n) && n >= 1 && n <= count) value = String(n);
                else return m.reply(`Choose a number from 1 to ${count}, or *rotate* / *random*.\nExample: ${P}greetings design ${slot} 1`);
                G.update(s => { s.designs[slot] = value; });
                const label = value === 'rotate' ? 'a different design every day' : value === 'random' ? 'a random design each time' : `design ${value}: ${G.DESIGNS[slot][Number(value) - 1]}`;
                return m.reply(`✅ ${G.META[slot].emoji} *${G.META[slot].label}* will use ${label}.`);
            }

            case 'card': case 'image': {
                const v = String(rest[0] || '').toLowerCase();
                if (!['on', 'off'].includes(v)) return m.reply(`Usage: *${P}greetings card on|off*`);
                G.update(s => { s.card = v === 'on'; });
                return m.reply(v === 'on' ? '🖼️ Greeting cards *enabled*.' : '📝 Greetings will be sent as *text only*.');
            }

            default:
                return m.reply(panel(bot, G.readSettings()));
        }
    },
};
                                                                                                    
