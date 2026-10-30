/**
 * .developers — sends the developers as contact cards (vCards), both in ONE message.
 * Edit the two entries below to change names/numbers.
 */
const DEVELOPERS = [
    { name: 'X61952 (Lead Developer)', number: '2349035671349' },
    { name: 'blazedev',         number: '2348153077566' },
];

function vcard(name, number, org) {
    return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${name}`,
        `ORG:${org};`,
        `TEL;type=CELL;type=VOICE;waid=${number}:+${number}`,
        'END:VCARD',
    ].join('\n');
}

module.exports = {
    name: 'developers',
    aliases: ['devs', 'developer', 'dev'],
    category: 'general',
    description: 'Contact the CODEX AI developers (vCards)',
    usage: '.developers',
    reactions: { start: '👨‍💻' },

    async execute(bot, m) {
        const org = bot.config?.botName || 'CODEX AI';
        await bot.sock.sendMessage(m.chat, {
            contacts: {
                displayName: 'CODEX AI Developers',
                contacts: DEVELOPERS.map((d) => ({ displayName: d.name, vcard: vcard(d.name, d.number, org) })),
            },
        }, { quoted: { key: m.key, message: m.message } });
    },
};
