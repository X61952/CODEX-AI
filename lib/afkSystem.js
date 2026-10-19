const tz = require('./timezone');
const fs = require('fs-extra');

const AFK_PATH     = './database/afk.json';
const AFK_CFG_PATH = './database/afk_config.json';

class AFKSystem {
    constructor(bot) {
        this.bot = bot;
    }

    _clean(jid) {
        if (!jid) return '';
        return jid.replace(/:[0-9]+@/, '@');
    }

    _collectMentionedJids(value, output = new Set(), seen = new Set(), depth = 0) {
        if (!value || depth > 8 || typeof value !== 'object' || seen.has(value)) return output;
        seen.add(value);
        if (Array.isArray(value)) {
            for (const item of value) this._collectMentionedJids(item, output, seen, depth + 1);
            return output;
        }
        if (Array.isArray(value.mentionedJid)) {
            for (const jid of value.mentionedJid) if (jid) output.add(jid);
        }
        for (const child of Object.values(value)) {
            if (child && typeof child === 'object') {
                this._collectMentionedJids(child, output, seen, depth + 1);
            }
        }
        return output;
    }

    async _identityForms(jid, groupJid = '') {
        const clean = this._clean(jid);
        if (!clean) return [];

        const forms = new Set([clean]);
        const lidMapping = this.bot.sock?.signalRepository?.lidMapping;

        try {
            if (clean.endsWith('@lid') && typeof lidMapping?.getPNForLID === 'function') {
                const phoneJid = await lidMapping.getPNForLID(clean);
                if (phoneJid) forms.add(this._clean(phoneJid));
            } else if (clean.endsWith('@s.whatsapp.net') && typeof lidMapping?.getLIDForPN === 'function') {
                const lidJid = await lidMapping.getLIDForPN(clean);
                if (lidJid) forms.add(this._clean(lidJid));
            }
        } catch {}

        if (groupJid?.endsWith('@g.us') && typeof this.bot.sock?.groupMetadata === 'function') {
            try {
                const metadata = await require('./groupMetaCache').get(this.bot, groupJid);
                const participant = (metadata.participants || []).find(entry => {
                    const aliases = [entry.id, entry.lid, entry.jid, entry.phoneNumber]
                        .map(value => this._clean(value))
                        .filter(Boolean);
                    return aliases.includes(clean);
                });
                if (participant) {
                    for (const value of [participant.id, participant.lid, participant.jid, participant.phoneNumber]) {
                        const alias = this._clean(value);
                        if (alias) forms.add(alias);
                    }
                }
            } catch {}
        }

        return [...forms];
    }

    async _resolveJid(jid, groupJid = '') {
        const forms = await this._identityForms(jid, groupJid);
        if (!forms.length) return '';

        return forms.find(form => form.endsWith('@s.whatsapp.net')) || forms[0];
    }

    _time() {
        return new Date().toLocaleString('en-NG', {
            timeZone: tz.get(),
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
    }

    _duration(ms) {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        if (h > 0) return `${h}h ${m}m ${r}s`;
        if (m > 0) return `${m}m ${r}s`;
        return `${r}s`;
    }

    _readDB()      { try { return JSON.parse(fs.readFileSync(AFK_PATH,     'utf8')); } catch { return {}; } }
    _writeDB(db)   { this._anyAfkAt = 0; fs.ensureDirSync('./database'); fs.writeFileSync(AFK_PATH,     JSON.stringify(db,  null, 2)); }
    _readCfg()     { try { return JSON.parse(fs.readFileSync(AFK_CFG_PATH, 'utf8')); } catch { return {}; } }
    _writeCfg(cfg) { fs.ensureDirSync('./database'); fs.writeFileSync(AFK_CFG_PATH, JSON.stringify(cfg, null, 2)); }

    async getMode(jid, groupJid = '') {
        const cfg = this._readCfg();
        const forms = await this._identityForms(jid, groupJid);
        return forms.map(form => cfg[form]?.mode).find(Boolean) || 'all';
    }

    async setMode(jid, mode, groupJid = '') {
        const cfg = this._readCfg();
        const forms = await this._identityForms(jid, groupJid);
        const key = forms.find(form => form.endsWith('@s.whatsapp.net')) || this._clean(jid);
        if (!cfg[key]) cfg[key] = {};
        cfg[key].mode = mode;
        this._writeCfg(cfg);
    }

    // pushName = the WhatsApp display name of the person going AFK
    async setAFK(userId, reason, pushName, groupJid = '') {
        const db  = this._readDB();
        const forms = await this._identityForms(userId, groupJid);
        const key = forms.find(form => form.endsWith('@s.whatsapp.net')) || this._clean(userId);
        const entry = {
            reason:   reason || 'AFK',
            name:     pushName || userId.split('@')[0],
            time:     Date.now(),
            lastSeen: this._time(),
            mentions: []
        };
        db[key] = entry;
        this._writeDB(db);
    }

    async removeAFK(userId, groupJid = '') {
        const db  = this._readDB();
        const forms = await this._identityForms(userId, groupJid);
        const key = forms.find(form => db[form]);
        if (!key) return null;
        const data = db[key];
        for (const form of forms) delete db[form];
        this._writeDB(db);
        return data;
    }

    async isAFK(userId) {
        const db = this._readDB();
        const forms = await this._identityForms(userId);
        return forms.map(form => db[form]).find(Boolean) || null;
    }

    // True when at least one person is AFK. Almost always false — and then there is
    // nothing for checkAFK to do, so it must not resolve identities (which needs
    // group member lists) for every message of every chat. Cached for 3s;
    // _writeDB() resets it so a new .afk is seen immediately.
    _anyAFK() {
        const now = Date.now();
        if (this._anyAfkAt && now - this._anyAfkAt < 3000) return this._anyAfk;
        let any = false;
        try { any = Object.keys(JSON.parse(fs.readFileSync(AFK_PATH, 'utf8'))).length > 0; } catch {}
        this._anyAfk = any;
        this._anyAfkAt = now;
        return any;
    }

    async checkAFK(m) {
        if (!this._anyAFK()) return;
        const senderClean = await this._resolveJid(m.sender, m.isGroup ? m.chat : '');
        const text        = m.text || '';
        const isCmd       = text.startsWith(this.bot.prefix);

        // ── STEP 1: AFK user sends a non-command → welcome back ───────────────
        const myAFK = await this.isAFK(senderClean);
        if (myAFK && !isCmd) {
            const removed  = await this.removeAFK(senderClean, m.isGroup ? m.chat : '');
            if (!removed) return;
            const duration = this._duration(Date.now() - removed.time);
            const count    = (removed.mentions || []).length;
            const name     = removed.name || m.pushName || senderClean.split('@')[0];

            await this.bot.sendMessage(m.chat, {
                text:
`✨ *Welcome back, ${name}!*
⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁
🌙 Reason you were away: *${removed.reason}*
⏱ Duration: *${duration}*
🕐 Last seen: ${removed.lastSeen}
💬 Mentioned *${count}* time(s) while you were away.
⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁`
            }).catch(() => {});
            return;
        }

        // ── STEP 2: Someone else's message — check for AFK user ───────────────
        if (m.fromMe) return;

        const notified = new Set();
        
        // TRIGGER for PRIVATE CHATS: check if the message recipient (owner) is AFK
        if (!m.isGroup) {
            // In a 1-1 chat, the other participant is the 'recipient'
            // If they're AFK, notify them via DM
            const recipientJid = m.chat;
            const recipientClean = await this._resolveJid(recipientJid, '');
            if (recipientClean !== senderClean) {
                const afk = await this.isAFK(recipientClean);
                if (afk && !notified.has(recipientClean)) {
                    notified.add(recipientClean);
                    await this._handle(m, senderClean, recipientClean, afk);
                }
            }
            return; // In DM, only check the recipient, don't check other mentions
        }

        // TRIGGER A: @mention tag
        const mentions = [...this._collectMentionedJids(m)];
        for (const match of String(text).matchAll(/@(\d{5,})/g)) {
            mentions.push(`${match[1]}@lid`, `${match[1]}@s.whatsapp.net`);
        }
        for (const raw of mentions) {
            const clean = await this._resolveJid(raw, m.chat);
            if (clean === senderClean)  continue;
            if (notified.has(clean))    continue;

            const afk = await this.isAFK(clean);
            if (!afk) continue;

            const mode = await this.getMode(clean, m.chat);
            if (mode === 'mention') continue;

            notified.add(clean);
            await this._handle(m, senderClean, clean, afk);
        }
        
        // IMPORTANT: If no mentions found but this is a group and owner is present,
        // check if owner is in the participants (implicit mention via group context)
        if (m.isGroup && mentions.length === 0) {
            const ownerJid = this.bot.config.owner;
            if (ownerJid) {
                const ownerClean = this._clean(ownerJid);
                if (ownerClean !== senderClean && !notified.has(ownerClean)) {
                    const afk = await this.isAFK(ownerClean);
                    if (afk) {
                        const mode = await this.getMode(ownerClean, m.chat);
                        // In groups, if someone sends ANY message while owner is AFK,
                        // and owner is in the group, notify them (unless mode is 'mention')
                        if (mode !== 'mention') {
                            notified.add(ownerClean);
                            await this._handle(m, senderClean, ownerClean, afk);
                        }
                    }
                }
            }
        }

        // TRIGGER B: quoted reply. Prefer the normalized quoted key because
        // some message types do not expose participant on contextInfo.
        const ctx = m.contextInfo || m.msg?.contextInfo || {};
        const quotedOwner = m.quoted?.key?.participant ||
            ctx.participant || ctx.participantAlt || null;
        if (quotedOwner) {
            const clean = await this._resolveJid(quotedOwner, m.chat);
            if (clean !== senderClean && !notified.has(clean)) {
                const afk = await this.isAFK(clean);
                if (afk) {
                    const mode = await this.getMode(clean, m.chat);
                    if (mode !== 'tag') {
                        notified.add(clean);
                        await this._handle(m, senderClean, clean, afk);
                    }
                }
            }
        }
    }

    async _handle(m, senderClean, afkUserClean, afk) {
        const time       = this._time();
        const duration   = this._duration(Date.now() - afk.time);
        const taggerName = m.pushName || senderClean.split('@')[0];
        const taggerNum  = senderClean.split('@')[0];
        const msgText    = m.text || '(media/sticker)';
        const afkName    = afk.name || afkUserClean.split('@')[0]; // their WhatsApp name

        // Save to DB
        const db = this._readDB();
        if (db[afkUserClean]) {
            if (!db[afkUserClean].mentions) db[afkUserClean].mentions = [];
            db[afkUserClean].mentions.push({ name: taggerName, number: taggerNum, message: msgText, time });
            this._writeDB(db);
        }

        // ── Reply to the person who triggered the AFK notice ──────────────────
        await this.bot.sendMessage(m.chat, {
            text:
    `👋 @${taggerNum}, *${afkName} is currently AFK*
⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁
📝 Reason: *${afk.reason}*
⏱ Duration: *${duration}*
🕐 Last seen: ${afk.lastSeen}
⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁
💡 They will be notified of your message.`
        , mentions: [senderClean]
        }).catch(() => {});

        // ── DM to AFK user ────────────────────────────────────────────────────
        let chatName = m.chat;
        if (m.isGroup) {
            try {
                const meta = await require('./groupMetaCache').get(this.bot, m.chat);
                chatName   = meta.subject || m.chat;
            } catch {}
        }

        const dmTarget = afkUserClean.includes('@') ? afkUserClean : afkUserClean + '@s.whatsapp.net';

        await this.bot.sendMessage(dmTarget, {
            text:
`🔔 *AFK ALERT*
⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁
👤 From: *${taggerName}* (+${taggerNum})
💬 Message: *${msgText}*
📍 Chat: *${chatName}*
🕐 Time: ${time} (NG)
⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁⌁
💤 Your reason: *${afk.reason}*
⏱ Duration so far: *${duration}*`,
            mentions: [senderClean]
        }).catch(() => {});
    }
}

module.exports = AFKSystem;
        
