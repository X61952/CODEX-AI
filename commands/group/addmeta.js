'use strict';

const RULE = '━━━━━━━━━━━━━━━━━━';
const row  = (label, value) => `▸ *${label}*  ${value}`;
const card = (icon, title, rows = [], footer = '') =>
    [RULE, `${icon}  *${title}*`, RULE, '', ...rows, ...(footer ? ['', `_${footer}_`] : [])].join('\n');

function extractInviteCode(value = '') {
    const match = String(value).trim().match(/(?:chat\.whatsapp\.com|wa\.me)\/([A-Za-z0-9_-]+)/i);
    return match?.[1] || null;
}

async function resolveGroupTarget(sock, value) {
    const target = String(value || '').trim();
    if (/^\d{8,20}(-\d+)?@g\.us$/i.test(target)) return target;

    const inviteCode = extractInviteCode(target);
    if (!inviteCode) return null;
    if (typeof sock.groupGetInviteInfo !== 'function') {
        throw new Error('This Baileys build cannot resolve group invite links');
    }
    const info = await sock.groupGetInviteInfo(inviteCode);
    const jid = info?.id || info?.jid;
    return /^\d{8,20}(-\d+)?@g\.us$/i.test(String(jid || '')) ? jid : null;
}

module.exports = {
    name:      'addmeta',
    alias:     ['metagroup', 'addmetabot'],
    desc:      'Add Meta AI to an AI group',
    description: 'Add Meta AI to an AI group.',
    category:  'group',
    ownerOnly: true,
    usage:     '.addmeta here | <group link> | <group JID>',
    reactions: { start: '🤖', success: '✨' },

    execute: async (bot, m, args = []) => {
        const prefix = bot.prefix || '.';
        const input = args.join(' ').trim();
        if (!input) {
            return m.reply(card('🤖', 'ADD META AI', [
                row('Usage', `${prefix}addmeta here | <group link> | <group JID>`),
                row('here', 'the group you are in'),
            ], 'Adds Meta AI to an AI group'));
        }

        try {
            let groupJid;
            if (input.toLowerCase() === 'here') {
                if (!String(m.chat || '').endsWith('@g.us')) {
                    return m.reply(card('⚠️', 'NOT A GROUP', [
                        `Use ${prefix}addmeta here inside a group,`,
                        'or give a group link / JID.',
                    ]));
                }
                groupJid = m.chat;
            } else {
                groupJid = await resolveGroupTarget(bot.sock, input);
            }
            if (!groupJid) {
                return m.reply(card('⚠️', 'INVALID TARGET', ['Provide a valid WhatsApp group link or group JID.']));
            }

            // ✅ Use the dedicated method – no extra arguments
            if (typeof bot.sock.aiGroupAddBot !== 'function') {
                return m.reply(card('❌', 'UNSUPPORTED BUILD', [
                    'This Baileys build does not support adding Meta AI to AI groups.',
                    'Update to a version that includes `aiGroupAddBot`.',
                ]));
            }

            await bot.sock.aiGroupAddBot(groupJid);

            return m.reply(card('✅', 'META AI', [
                row('Status', 'invoked'),
                row('Group', groupJid.split('@')[0]),
            ]));
        } catch (err) {
            console.error('[ADDMETA]', err?.message || err);
            const msg = err?.message || 'Unable to add Meta AI to that group';
            // Provide a more accurate explanation for common failures
            if (/403|forbidden/i.test(msg)) {
                return m.reply(card('❌', 'COULD NOT ADD', [
                    'Meta AI can only be added to **AI groups** (created with `aiGroupCreate`).',
                    'If this is an AI group, make sure the bot is an admin and Meta AI is not already present.',
                    'WhatsApp may also block the request for other policy reasons.',
                ]));
            }
            return m.reply(card('❌', 'COULD NOT ADD', [msg + '.']));
        }
    },
};

module.exports.extractInviteCode = extractInviteCode;
module.exports.resolveGroupTarget = resolveGroupTarget;
