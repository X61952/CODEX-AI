/**
 * CODEX AI — chatbot control.
 *
 *   .chatbot on | off              owner in DM = master switch · admin/owner in a group = this group only
 *   .chatbot on all | off all      master switch (owner, works anywhere)
 *   .chatbot mode dm|group|tag     who/when it answers (can combine: .chatbot mode dm tag · .chatbot mode all)
 *   .chatbot train <prompt>        set custom training (owner) — becomes active
 *   .chatbot default               fall back to the default training — your custom one stays saved
 *   .chatbot custom                switch the saved custom training back on
 *   .chatbot voice on|off|auto     off = text (default) · auto = voice-only when they send a voice note · on = always voice-only
 *   .chatbot clear                 wipe this chat's memory
 *   .chatbot status                everything at a glance
 *
 * (.mode dm|group|tag also works — see commands/owner/mode.js)
 */
const store = require('../../lib/ai/store');
const engine = require('../../lib/ai/engine');
const persona = require('../../lib/ai/persona');

const MODE_HELP =
`• *dm* — answers private chats
• *group* — in groups: when someone *replies to the bot*, says *"codex"*, or *tags* it (anyone, not only mods)
• *tag* — in groups: only when the bot is *tagged*
• *all* — dm + group
Combine: _.chatbot mode dm tag_ · everything: _.mode all_ · shortcut: _.mode dm_ / _.mode group_ / _.mode tag_`;

function describeModes(modes) {
    if (modes.includes('dm') && modes.includes('group')) return 'ALL (DMs + groups)';
    return modes.map((x) => x.toUpperCase()).join(' + ') || 'NONE';
}

module.exports = {
    name: 'chatbot',
    aliases: ['aichat', 'cb'],
    category: 'general',
    description: 'CODEX AI chatbot — on/off, modes (dm/group/tag), training',
    usage: '.chatbot status',

    async execute(bot, m, args) {
        const p = bot.prefix || '.';
        const isGroup = m.isGroup;
        const isOwner = bot.permission.isOwner(m.sender);
        const isAdmin = isGroup ? await bot.permission.isAdmin(m.chat, m.sender, m._participantRaw).catch(() => false) : false;
        const sub = (args[0] || 'status').toLowerCase();
        const rest = args.slice(1);
        const s = store.get();

        const ownerOnly = () => m.reply('❌ Bot owner only — this changes the chatbot for every chat.');

        // ── status ──────────────────────────────────────────────────────
        if (sub === 'status' || sub === 'help' || sub === 'menu') {
            const keys = engine.keyStatus(bot);
            const here = isGroup
                ? `\n❏◦ This group: *${s.chats[m.chat] === true ? 'FORCED ON' : s.chats[m.chat] === false ? 'OFF' : 'follows master'}*`
                : '';
            return await m.reply(
`🧠 *CODEX AI CHATBOT*

❏◦ Master switch: *${s.enabled ? 'ON ✅' : 'OFF ❌'}*${here}
❏◦ Mode: *${describeModes(s.modes)}*
❏◦ Training: *${s.useDefault || !s.customTrain ? 'DEFAULT' : 'CUSTOM'}*${s.customTrain ? ` _(custom ${s.useDefault ? 'saved, not active' : 'active'})_` : ''}
❏◦ Voice replies: *${s.voice.toUpperCase()}*
❏◦ Memory here: ${engine.memoryCount(isGroup ? 'grp:' + m.chat : 'dm:' + m.sender)} msgs
❏◦ Groq key: ${keys.groq ? '✅' : '❌ missing'}

*Commands*
${p}chatbot on / off
${p}chatbot mode dm | group | tag
${p}chatbot train <your prompt>
${p}chatbot default  _(back to default training)_
${p}chatbot custom   _(use your saved training again)_
${p}chatbot voice on | off | auto  _(off = text, default)_
${p}chatbot clear

*Modes*
${MODE_HELP}

_Send it an image, sticker, video or voice note and it will help._`);
        }

        // ── on / off ────────────────────────────────────────────────────
        if (sub === 'on' || sub === 'off') {
            const on = sub === 'on';
            const global = (rest[0] || '').toLowerCase() === 'all' || !isGroup;
            if (global) {
                if (!isOwner) return await ownerOnly();
                store.update((d) => { d.enabled = on; });
                const keys = engine.keyStatus(bot);
                return await m.reply(on
                    ? `✅ *Chatbot ON* (${describeModes(store.get().modes)}).${keys.groq ? '' : '\n⚠️ GROQ_API_KEY is not set yet — it cannot answer until you add it.'}`
                    : '❌ *Chatbot OFF* everywhere (groups that were forced on stay on — use .chatbot off inside them).');
            }
            if (!isOwner && !isAdmin) return await m.reply('❌ Group admins only.');
            store.update((d) => { d.chats[m.chat] = on; });
            return await m.reply(on
                ? `✅ *Chatbot ON* in this group.\nMode: *${describeModes(s.modes)}* — change with ${p}chatbot mode`
                : '❌ *Chatbot OFF* in this group.');
        }

        // ── mode ────────────────────────────────────────────────────────
        if (sub === 'mode') {
            if (!isOwner) return await ownerOnly();
            const modes = store.parseModes(rest);
            if (!modes || !modes.length) {
                return await m.reply(`Current mode: *${describeModes(s.modes)}*\n\n${MODE_HELP}\n\nUsage: ${p}chatbot mode dm | group | tag`);
            }
            store.update((d) => { d.modes = modes; });
            return await m.reply(`✅ Chatbot mode set to *${describeModes(modes)}*.${s.enabled ? '' : `\n_(It's still OFF — turn it on with ${p}chatbot on)_`}`);
        }

        // ── train / default / custom ────────────────────────────────────
        if (sub === 'train' || sub === 'training') {
            if (!isOwner) return await ownerOnly();
            const prompt = rest.join(' ').trim();
            if (!prompt) {
                return await m.reply(
                    `Usage: ${p}chatbot train <your prompt>\n\nExample:\n${p}chatbot train You are Zara, a funny assistant for my store. Keep replies short and use emojis.\n\n` +
                    (s.customTrain ? `Saved custom training:\n_${s.customTrain.slice(0, 400)}_` : 'No custom training saved yet.')
                );
            }
            if (prompt.length > 6000) return await m.reply('❌ That training is too long (max 6000 characters).');
            store.update((d) => { d.customTrain = prompt; d.useDefault = false; });
            engine.clearMemory(); // fresh start with the new personality
            return await m.reply(`✅ *Custom training is now ACTIVE.*\n\n_${prompt.slice(0, 400)}${prompt.length > 400 ? '…' : ''}_\n\nUse ${p}chatbot default to go back to the default (your training stays saved).`);
        }
        if (sub === 'default') {
            if (!isOwner) return await ownerOnly();
            store.update((d) => { d.useDefault = true; });
            engine.clearMemory();
            return await m.reply(`🔄 Back on the *default training* (${persona.AI_NAME}).${s.customTrain ? `\nYour custom training is still saved — ${p}chatbot custom brings it back.` : ''}`);
        }
        if (sub === 'custom') {
            if (!isOwner) return await ownerOnly();
            if (!s.customTrain) return await m.reply(`No custom training saved yet. Use ${p}chatbot train <your prompt>`);
            store.update((d) => { d.useDefault = false; });
            engine.clearMemory();
            return await m.reply('✅ Custom training is *active* again.');
        }

        // ── voice ───────────────────────────────────────────────────────
        if (sub === 'voice') {
            if (!isOwner) return await ownerOnly();
            const v = (rest[0] || '').toLowerCase();
            if (!['on', 'off', 'auto'].includes(v)) {
                return await m.reply(`🎙️ Voice replies: *${s.voice.toUpperCase()}*\n\n${p}chatbot voice off — text replies (default; it still understands voice notes)\n${p}chatbot voice auto — they send a voice note → it replies with a voice note only\n${p}chatbot voice on — always replies with a voice note only`);
            }
            store.update((d) => { d.voice = v; });
            return await m.reply(`🎙️ Voice replies: *${v.toUpperCase()}*`);
        }

        // ── clear ───────────────────────────────────────────────────────
        if (sub === 'clear' || sub === 'reset') {
            engine.clearMemory(isGroup ? 'grp:' + m.chat : 'dm:' + m.sender);
            return await m.reply('🧹 Memory cleared for this chat.');
        }

        return await m.reply(`❓ Unknown option. Try ${p}chatbot status`);
    },
};
