'use strict';

const META_AI_BOT_USER = '867051314767696';

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

function readAddResults(result) {
    const children = (node) => (Array.isArray(node?.content) ? node.content : []);
    const add = children(result).find((n) => n?.tag === 'add');
    return children(add)
        .filter((n) => n?.tag === 'participant')
        .map((n) => ({ status: n.attrs?.error || '200', jid: n.attrs?.jid }));
}

async function addMetaAI(sock, groupJid, botUser = META_AI_BOT_USER) {
    if (typeof sock.aiGroupAddBot === 'function') {
        return sock.aiGroupAddBot(groupJid, botUser);
    }
    if (typeof sock.query !== 'function') {
        throw new Error('This Baileys build cannot add Meta AI to groups');
    }
    const result = await sock.query({
        tag: 'iq',
        attrs: { type: 'set', xmlns: 'w:g2', to: groupJid },
        content: [{
            tag: 'add',
            attrs: {},
            content: [{ tag: 'participant', attrs: { jid: `${botUser}@bot` } }],
        }],
    });
    return readAddResults(result);
}

module.exports = {
    name:      'addmeta',
    alias:     ['metagroup', 'addmetabot'],
    desc:      'Add Meta AI to a group',
    description: 'Add Meta AI to a group.',
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
            ], 'Adds Meta AI to a group'));
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

            const results = await addMetaAI(bot.sock, groupJid);
            const failed = (Array.isArray(results) ? results : []).find((r) => r?.status && String(r.status) !== '200');
            if (failed) {
                const reason = {
                    403: 'I need to be an admin (or members must be allowed to add)',
                    409: 'Meta AI is already in that group',
                    401: 'Not allowed to add Meta AI to that group',
                }[Number(failed.status)] || `WhatsApp refused (code ${failed.status})`;
                return m.reply(card('❌', 'COULD NOT ADD', [reason + '.']));
            }
            return m.reply(card('✅', 'META AI', [row('Status', 'invoked'), row('Group', groupJid.split('@')[0])]));
        } catch (err) {
            console.error('[ADDMETA]', err?.message || err);
            const msg = /not-authorized|forbidden/i.test(err?.message || '')
                ? 'I need to be an admin in that group first'
                : (err?.message || 'Unable to add Meta AI to that group');
            return m.reply(card('❌', 'COULD NOT ADD', [msg + '.']));
        }
    },
};

module.exports.META_AI_BOT_USER = META_AI_BOT_USER;
module.exports.extractInviteCode = extractInviteCode;
module.exports.resolveGroupTarget = resolveGroupTarget;
module.exports.addMetaAI = addMetaAI;
module.exports.readAddResults = readAddResults;
