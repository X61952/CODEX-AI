const fs = require('fs-extra');
const { detectScam, detectBeg, detectGameText } = require('./antiPatterns');
const { hasValidCode, matchCode } = require('./countryCodes');
const { detectBug } = require('./antiBug');
const tz = require('./timezone');

// ── Newer anti-systems: registry ───────────────────────────────────────────
// AntiImage, AntiAudio, AntiDoc, AntiPoll, AntiEvent, AntiLocation,
// AntiContact, AntiNewcomerLinks, AntiRaid, ModLog, AntiPromote. Each one has its own ./database/<name>.json (group -> settings)
// exactly like antivideo/antilink, and its own commands/admin/<name>.js
// toggle. Everything that DECIDES and ENFORCES lives in this file.
const MODLOG_PATH = './database/modlog.json';          // log entries
const BUG_PATH    = './database/antibug.json';         // AntiBug settings
const MODLOG_MAX_PER_GROUP = 1000;

const FEATURES = {
    antiimage:    { label: 'AntiImage',    reason: 'Images are not allowed',
                    match: (m, t) => t === 'imageMessage' },
    antiaudio:    { label: 'AntiAudio',    reason: 'Audio files are not allowed',
                    match: (m, t) => t === 'audioMessage' && !m.msg?.ptt },
    antidoc:      { label: 'AntiDoc',      reason: 'Documents are not allowed',
                    match: (m, t) => t === 'documentMessage' || t === 'documentWithCaptionMessage' },
    antipoll:     { label: 'AntiPoll',     reason: 'Polls are not allowed',
                    match: (m, t) => /^pollCreationMessage/.test(t || '') },
    antievent:    { label: 'AntiEvent',    reason: 'Events are not allowed',
                    match: (m, t) => t === 'eventMessage' },
    antilocation: { label: 'AntiLocation', reason: 'Locations are not allowed',
                    match: (m, t) => t === 'locationMessage' || t === 'liveLocationMessage' },
    anticontact:  { label: 'AntiContact',  reason: 'Contact cards are not allowed',
                    match: (m, t) => t === 'contactMessage' || t === 'contactsArrayMessage' },
};
const TYPE_KEYS = Object.keys(FEATURES);
// Settings file of a feature (ModLog's log entries own modlog.json).
const dbOf = (key) => `./database/${key === 'modlog' ? 'modlogsettings' : key}.json`;
// Features that need a look at every message (the rest are event-driven).
const MESSAGE_KEYS = [...TYPE_KEYS, 'antinewcomerlinks'];

function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function writeJSON(file, data) { fs.ensureDirSync('./database'); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

class AntiSystems {
    constructor(bot) {
        this.bot       = bot;
        this.spamCache = new Map();
        // AntiBug / AntiNewcomerLinks / AntiRaid state — all
        // in-memory and swept by _startSpamCacheSweep() so none of it can
        // grow without bound on a long-running bot.
        this._bugFloods   = new Map(); // sender|kind -> [timestamps]
        this._bugBlocked  = new Map(); // sender -> time they were blocked
        this._bugNotified = new Map(); // group|sender -> last notice time
        this._joinTimes   = new Map(); // group_userkey -> join time
        this._raidState   = new Map(); // group -> { joins: [{t,id}], until }
        this._startSpamCacheSweep();
        // In-memory cache for _readDB() results, keyed by file path. Every
        // anti-system feature (antilink, antispam, antitag, antigame,
        // antigroupmention, ...) previously called _readDB() — a synchronous
        // fs.readFileSync + JSON.parse — on EVERY single incoming message in
        // EVERY group, just to check whether that feature was even enabled.
        // On a bot in many active groups that's a blocking disk read on the
        // event loop per message per feature, which delays everything else
        // queued on the loop (including Baileys' own websocket handling).
        //
        // Cached by file mtime rather than pure write-through: the toggle
        // commands (commands/admin/antilink.js etc.) write these same JSON
        // files directly with their own fs.writeFileSync, bypassing this
        // class's _writeDB(). An mtime check (one cheap fs.statSync, not a
        // full read+parse) on every access means a setting change from
        // *any* code path is picked up on the very next message, while a
        // file that hasn't changed is still served straight from memory.
        this._dbCache = new Map(); // file -> { data, mtimeMs }
    }

    // spamCache entries were only ever added, never proactively removed —
    // a user hitting the spam limit gets their entry deleted (see below),
    // but a user who sends a FEW messages and then goes quiet (well under
    // the spam limit) leaves a stale entry sitting in the Map forever. On a
    // bot in many active groups over weeks/months this is unbounded growth.
    // A periodic sweep drops any entry whose cooldown window has long since
    // passed, regardless of whether it was ever "resolved" by hitting the
    // limit.
    _startSpamCacheSweep() {
        if (this._spamSweepTimer) return;
        this._spamSweepTimer = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.spamCache) {
                // 10 minutes is comfortably longer than any realistic
                // antispam cooldown window, so this only ever removes
                // entries that are truly stale.
                if (now - entry.first > 10 * 60 * 1000) this.spamCache.delete(key);
            }
            for (const [k, arr] of this._bugFloods) {
                if (!arr.length || now - arr[arr.length - 1] > 60 * 1000) this._bugFloods.delete(k);
            }
            for (const [k, t] of this._bugBlocked)  if (now - t > 10 * 60 * 1000) this._bugBlocked.delete(k);
            for (const [k, t] of this._bugNotified) if (now - t > 5 * 60 * 1000)  this._bugNotified.delete(k);
            for (const [k, t] of this._joinTimes)   if (now - t > 2 * 60 * 60 * 1000) this._joinTimes.delete(k);
            for (const [k, e] of this._raidState) {
                if (e.until < now && !e.joins.some((j) => now - j.t < 2 * 60 * 60 * 1000)) this._raidState.delete(k);
            }
        }, 5 * 60 * 1000);
        this._spamSweepTimer.unref?.();
    }

    _readDB(f) {
        try {
            const stat = fs.statSync(f);
            const cached = this._dbCache.get(f);
            if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;
            const data = JSON.parse(fs.readFileSync(f, 'utf8'));
            this._dbCache.set(f, { data, mtimeMs: stat.mtimeMs });
            return data;
        } catch {
            // File missing/unreadable/corrupt — don't cache a failure, just
            // return an empty object for this call.
            return {};
        }
    }
    _writeDB(f, d) {
        fs.ensureDirSync('./database');
        fs.writeFileSync(f, JSON.stringify(d, null, 2));
        try {
            const stat = fs.statSync(f);
            this._dbCache.set(f, { data: d, mtimeMs: stat.mtimeMs });
        } catch {
            this._dbCache.delete(f);
        }
    }
    _linkRegex()   { return /(https?:\/\/|www\.)[^\s]+|chat\.whatsapp\.com\/[^\s]+/i; }
    _linkRegexGlobal() { return /(https?:\/\/|www\.)[^\s]+|chat\.whatsapp\.com\/[^\s]+/gi; }

    // BUG (found): antiword never matched an emoji banned "word" that was
    // typed/sent with a different (but visually identical) unicode form —
    // e.g. an admin adds "❤️" (base heart + VARIATION SELECTOR-16, U+FE0F)
    // but an offender's client sends the bare "❤" (no selector), or a
    // gesture emoji arrives with a skin-tone modifier the stored word
    // didn't have. Plain string .includes() then never matches even though
    // they're the same emoji to a human. Stripping variation selectors +
    // skin-tone modifiers (and normalizing to NFC) before comparing makes
    // matching robust to whichever exact codepoint sequence either side
    // happened to use. Used on BOTH the stored word and the message text
    // so they're compared on equal footing.
    _normalizeEmojiText(str) {
        return String(str || '')
            .normalize('NFC')
            .replace(/[\uFE0E\uFE0F]/g, '')          // variation selectors
            .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');  // skin-tone modifiers
    }

    // DND detection — checks whether this message tags or replies to the
    // owner OR the bot itself. Same LID-aware matching that used to live
    // inline in messageHandler.js, moved here so DND can go through
    // _doAction() like every other anti-system (delete/kick/warn, not just
    // a hardcoded delete+reply).
    async _checkDndTag(m) {
        const toPhone = (j) => (j || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
        const normLid = (j) => (j || '').replace(/:[0-9]+@/, '@').toLowerCase().trim();

        const ownerRaw   = this.bot.config.owner;
        const ownerPhone = ((typeof ownerRaw === 'object' ? ownerRaw?.number : ownerRaw) || '').replace(/[^0-9]/g, '');
        const ownerJid   = ownerPhone + '@s.whatsapp.net';
        let ownerLid = '';
        try { ownerLid = (await this.bot.sock.signalRepository?.lidMapping?.getLIDForPN(ownerJid)) || ''; } catch {}
        const isOwnerJid = (j) => !!j && ((!!ownerPhone && toPhone(j) === ownerPhone) || (!!ownerLid && normLid(j) === normLid(ownerLid)));

        const botJid = normLid(this.bot.sock.user?.id || '');
        const isBotJid = (j) => !!j && !!botJid && normLid(j) === botJid;

        const allMentions = [
            ...(m.mentions || []),
            ...(m.contextInfo?.mentionedJid || []),
            ...(m.msg?.contextInfo?.mentionedJid || []),
        ];
        const quotedPart = m.contextInfo?.participant || m.msg?.contextInfo?.participant || '';

        const tagsOwner     = allMentions.some(isOwnerJid);
        const repliesToOwner = isOwnerJid(quotedPart);
        const tagsBot       = allMentions.some(isBotJid);
        const repliesToBot  = isBotJid(quotedPart);

        return {
            triggered: tagsOwner || repliesToOwner || tagsBot || repliesToBot,
            wasOwner: tagsOwner || repliesToOwner,
        };
    }

    // Per-group settings ONLY — never falls back to global config.
    // Default is always { enabled: false } so the bot does nothing until
    // an admin explicitly enables a feature in that specific group.
    _settings(dbPath, groupId) {
        const db = this._readDB(dbPath);
        return db[groupId] || { enabled: false };
    }

    // Every per-group anti feature that checkAll() can act on, each gated by an
    // `enabled` flag in its own database file. Keep in sync with _checkAllInner().
    static ACTIVE_FEATURE_DBS = [
        './database/dnd.json',
        './database/antilink.json',
        './database/antispam.json',
        './database/antitag.json',
        './database/antigame.json',
        './database/antigroupmention.json',
        './database/antigcstatus.json',
        './database/antibot.json',
        './database/antiword.json',
        './database/antiscam.json',
        './database/antibeg.json',
        './database/antiforwarding.json',
        './database/antivideo.json',
        './database/antisticker.json',
        './database/antivv.json',
        './database/antivn.json',
    ];

    // Cheap, synchronous "is there ANYTHING for checkAll() to do in this group?"
    // Most groups run with every anti feature off. Before this check, every
    // group message from a regular member still paid for two admin lookups
    // (a scan of the whole member list each, plus a 5s guard timer, plus a
    // possible groupMetadata network round-trip when the cache expired) only
    // to end at `return false`. Returning false here is behavior-identical
    // for those groups: with no feature enabled, _checkAllInner() has no
    // side effects (spam counters only move when antispam is enabled).
    _hasActiveFeature(m) {
        const groupId = m.chat;
        for (const f of AntiSystems.ACTIVE_FEATURE_DBS) {
            if (this._settings(f, groupId).enabled) return true;
        }
        // Block-sticker has no `enabled` flag: it is always enforced when a hash is listed.
        if (m.type === 'stickerMessage' && m.msg?.fileSha256) {
            const list = this._readDB('./database/blockedstickers.json')[groupId];
            if (Array.isArray(list) && list.length) return true;
        }
        return false;
    }

    async _isBotAdmin(groupId) {
        try { return await this.bot.permission.isBotAdmin(groupId); }
        catch { return false; }
    }

    // Sends ONE quoted/tagged message carrying both the flag and the outcome
    // text, before the actual delete/kick runs — so there's a single visible
    // record of exactly which message triggered the anti-system, instead of
    // a separate tag message plus a second unquoted follow-up.
    //
    // `quote` defaults to true for every anti-system except DND: DND's
    // flagged message is, by definition, one that @-mentions the owner or
    // the bot — quoting it would re-surface that exact mention/tag inside
    // our own reply. DND passes quote:false so the owner/bot are only ever
    // referred to in plain text (see the reason strings in checkAll), never
    // tagged.
    //
    // `extraLine`, when given, is inserted as its own line right after the
    // "🚩 @offender" header and before the action-specific text — used by
    // DND to show "<Owner/Bot name> is currently on Do Not Disturb." above
    // the "Reason: ..." line, without changing that line's own format.
    async _notify(groupId, userId, text, m, quote = true, extraLine = null) {
        const body = extraLine ? `${extraLine}\n${text}` : text;
        try {
            await this.bot.sock.sendMessage(groupId, {
                text: `🚩 @${userId.split('@')[0]}\n${body}`,
                mentions: [userId]
            }, quote ? { quoted: m } : {});
        } catch (e) {
            // Fall back to an unquoted message if the source message can't be
            // quoted (e.g. it's already gone) — the notice itself must not fail.
            try {
                await this.bot.sendMessage(groupId, {
                    text: `🚩 @${userId.split('@')[0]}\n${body}`,
                    mentions: [userId]
                });
            } catch {}
        }
    }

    async _doAction(groupId, userId, settings, reason, m, quote = true, extraLine = null, suffixLine = 'This is not allowed here.') {
        const action   = settings.action   || 'warn';
        // Cap warnings at 3 maximum (not 1-10)
        const maxWarns = Math.min(Math.max(settings.maxWarns || 3, 1), 3);

        // ModLog: one line per anti-system action (no-op unless .modlog on).
        this._modLog(groupId, userId, action, reason);

        if (action === 'delete') {
            const deleteText = suffixLine ? `Reason: ${reason}\n${suffixLine}` : `Reason: ${reason}`;
            await this._notify(groupId, userId, deleteText, m, quote, extraLine);
            await this._tryDelete(m);
            return true;
        }

        if (action === 'kick') {
            await this._notify(groupId, userId, `Removed.\nReason: ${reason}`, m, quote, extraLine);
            await this._tryDelete(m);
            await this._kick(groupId, userId);
            return true;
        }

        if (action === 'warn') {
            const warnPath = './database/warnings.json';
            let warns = this._readDB(warnPath);
            const key = `${groupId}_${userId}`;
            if (!warns[key] || typeof warns[key] === 'number') {
                warns[key] = { count: typeof warns[key] === 'number' ? warns[key] : 0, history: [] };
            }
            warns[key].count++;
            warns[key].history.push({
                reason, issuer: 'Auto', issuerName: 'System',
                time: new Date().toLocaleString('en-NG', { timeZone: tz.get(), hour12: true })
            });
            const count = warns[key].count;
            this._writeDB(warnPath, warns);

            if (count >= maxWarns) {
                await this._notify(groupId, userId, `⛔ Removed after ${maxWarns}/${maxWarns} warnings.\nReason: ${reason}`, m, quote, extraLine);
                await this._tryDelete(m);
                await this._kick(groupId, userId);
                warns[key] = { count: 0, history: [] };
                this._writeDB(warnPath, warns);
            } else {
                await this._notify(groupId, userId, `⚠️ Warning ${count}/${maxWarns}\nReason: ${reason}`, m, quote, extraLine);
                await this._tryDelete(m);
            }
            return true;
        }
        return false;
    }

    async _kick(groupId, userId) {
        try { await this.bot.sock.groupParticipantsUpdate(groupId, [userId], 'remove'); }
        catch (e) {         return false; }
    }

    async _tryDelete(m) {
        if (!m || !m.key) return;
        try { await this.bot.sock.sendMessage(m.chat, { delete: m.key }); } catch {}
    }

    async checkAll(m) {
        // Fires the instant this function is entered, BEFORE any await —
        // if this line is missing from the console entirely for a given
        // message, checkAll() was never called at all (the bug is upstream,
        // in messageHandler.js's outer gate). If this line prints but
        // nothing after it ever does, checkAll() itself is hanging or
        // throwing below.

        try {
            // Safety gate: NEVER run anti-systems in DMs or if bot is not admin.
            // This was the root cause of the bot tagging people about links
            // even when it had no admin rights to do anything about it.
            if (!m.isGroup) return false;

            // Nothing enabled in this group -> nothing to do (see _hasActiveFeature).
            if (!this._hasActiveFeature(m)) return false;

            // _isBotAdmin() calls sock.groupMetadata() under the hood, which can
            // hang indefinitely on a flaky/reconnecting socket instead of ever
            // resolving or rejecting. Race it against a 5s timeout so a hang
            // gets logged instead of silently freezing this message forever.
            // The timer is always cleared so it can't pile up per message.
            let guard;
            let botIsAdmin;
            try {
                botIsAdmin = await Promise.race([
                    this._isBotAdmin(m.chat),
                    new Promise((resolve) => { guard = setTimeout(() => resolve(false), 5000); }),
                ]);
            } finally {
                clearTimeout(guard);
            }

            if (!botIsAdmin) {
                return false;
            }

            return await this._checkAllInner(m);
        } catch (err) {
            // Anything thrown anywhere in checkAll (or _checkAllInner) lands
            // here instead of silently vanishing or getting swallowed by an
            // unrelated try/catch further up the call stack.
            return false;
        }
    }

    async _checkAllInner(m) {
        // Never act on the bot's own messages. Without this, a message the
        // bot itself sends (e.g. a link, or its own warning/tag text that
        // mentions several users) could match a trigger and cause the bot
        // to warn/delete/kick itself.
        if (m.fromMe || m.key?.fromMe) return false;

        // Extra safety: owner and mods always bypass anti-systems
        const isOwner = this.bot.permission.isOwner(m.sender);
        const isMod = this.bot.permission.isMod(m.sender, m._participantRaw);
        if (isOwner || isMod) {
                return false;
        }

        // DND runs HERE — deliberately BEFORE the group-admin bypass below,
        // unlike every other anti-system. DND exists to protect the owner
        // and the bot from being tagged/replied-to while busy, and a group
        // admin has authority over their group's content but not over the
        // owner's do-not-disturb status — so DND must still fire against
        // them even though antilink/antispam/etc. wouldn't.
        const dndSettings = this._settings('./database/dnd.json', m.chat);
        if (dndSettings.enabled) {
            const { triggered, wasOwner } = await this._checkDndTag(m);
            if (triggered) {
                // Owner/bot referred to by their configured display NAME —
                // config.json already has owner.name and botName for
                // exactly this, no @mention involved either way.
                const who = wasOwner
                    ? (this.bot.config.owner?.name || 'The owner')
                    : (this.bot.config.botName || 'The bot');
                const extraLine = `${who} is currently on Do Not Disturb.`;
                const reason = dndSettings.customMsg || 'Do not disturb';
                // quote:false — the flagged message itself contains the
                // @owner/@bot mention that triggered this; quoting it back
                // would re-surface that exact tag inside our own reply.
                // suffixLine:null — DND doesn't want the generic "This is
                // not allowed here." line every other anti-system gets;
                // "Reason: ..." already says enough on its own.
                return await this._doAction(m.chat, m.sender, dndSettings, reason, m, false, extraLine, null);
            }
        }

        // BUG (found): bot-owner/bot-mod is a completely different thing
        // from being a WhatsApp group admin/superadmin — the two checks
        // above only cover the bot's own privileged users. A group admin
        // who isn't also the bot owner or a bot-mod had NO exemption at
        // all and could still get warned/deleted/kicked by anti-systems
        // like antilink, antispam, etc. Group admins/superadmins should
        // never be actioned by moderation they themselves have authority
        // over — check their real WhatsApp role too.
        const isGroupAdmin = await this.bot.permission.isAdmin(m.chat, m.sender, m._participantRaw).catch(() => false);
        if (isGroupAdmin) {
            return false;
        }

        const groupId = m.chat;
        const userId  = m.sender;
        const text    = m.text || '';

        // Anti-Link (per-group, off by default)
        const alSettings = this._settings('./database/antilink.json', groupId);
        if (alSettings.enabled) {
            // Every link found in the message, not just a single yes/no test —
            // needed so an allowed link can sit alongside checking others.
            const foundLinks = text.match(this._linkRegexGlobal()) || [];
            if (foundLinks.length) {
                const allowed = alSettings.allowedLinks || [];
                const isAllowed = (link) => allowed.some((a) =>
                    link.toLowerCase().includes(a.toLowerCase()) ||
                    a.toLowerCase().includes(link.toLowerCase())
                );
                const hasDisallowedLink = foundLinks.some((link) => !isAllowed(link));
                if (hasDisallowedLink) {
                    return await this._doAction(groupId, userId, alSettings, 'No links allowed', m);
                }
            }
        }

        // Anti-Spam (per-group, off by default)
        const asSettings = this._settings('./database/antispam.json', groupId);
        if (asSettings.enabled) {
            const limit    = asSettings.limit    || 5;
            const cooldown = asSettings.cooldown || 10000;
            const key      = `${groupId}_${userId}`;
            const now      = Date.now();
            const entry    = this.spamCache.get(key) || { count: 0, first: now };

            if (now - entry.first > cooldown) {
                this.spamCache.set(key, { count: 1, first: now });
            } else {
                entry.count++;
                this.spamCache.set(key, entry);
                if (entry.count >= limit) {
                    this.spamCache.delete(key);
                    return await this._doAction(groupId, userId, asSettings, 'Spamming not allowed', m);
                }
            }
        }

        // Anti-Tag (per-group, off by default)
        const atSettings = this._settings('./database/antitag.json', groupId);
        if (atSettings.enabled && (m.mentions || []).length >= 5) {
            return await this._doAction(groupId, userId, atSettings, 'Mass tagging not allowed', m);
        }

        // Anti-Game (per-group, off by default)
        const agSettings = this._settings('./database/antigame.json', groupId);
        if (agSettings.enabled) {
            const gameEmojiPattern = /^(\u{1F3B2}|\u{1F3AF}|\u{1F3C0}|\u26BD|\u{1F3B3}|\u{1F3B0}|\u{1F9E9})$/u;
            const isGameEmoji   = gameEmojiPattern.test(text.trim());
            const isGameMsgType = m.type === 'gameMessage' || m.type === 'interactiveMessage' ||
                                  m.type === 'nativeFlowMessage' || !!(m.msg?.nativeFlowMessage) ||
                                  !!(m.msg?.interactiveMessage);
            // Text-based game invites/names (ttt, truth or dare, rps, poll,
            // trivia, uno, ludo, bingo, ...) — lib/antiPatterns.js. The
            // emoji/message-type checks above only ever caught a handful of
            // dice/dart-style emoji or WhatsApp's own native poll/game
            // message types; most real "let's play a game" chatter in a
            // group is plain text and was never caught at all.
            const isGameText = !!text && detectGameText(text);
            if (isGameEmoji || isGameMsgType || isGameText) {
                return await this._doAction(groupId, userId, agSettings, 'Games/pills are not allowed here', m);
            }
        }

        // Anti-Group Mention (per-group, off by default)
        // Detects @everyone / @group wide-broadcast tags and forwarded
        // group-mention content inside normal chat messages. Includes the
        // real, verified signals a working reference bot (SUKUNA_MD) uses —
        // contextInfo.groupMentions, contextInfo.isSampled, and a mentioned
        // JID that is itself a group (@g.us) — in addition to the original
        // checks already here.
        const agmSettings = this._settings('./database/antigroupmention.json', groupId);
        if (agmSettings.enabled) {
            const rawMsg = m.msg || m.message || {};
            const ctxAGM = rawMsg.extendedTextMessage?.contextInfo ||
                           rawMsg.imageMessage?.contextInfo ||
                           rawMsg.videoMessage?.contextInfo ||
                           rawMsg.contextInfo || {};

           /* let isStatusMention = false;
            isStatusMention = isStatusMention || !!rawMsg.groupStatusMentionMessage;
            isStatusMention = isStatusMention || (rawMsg.protocolMessage?.type === 25);
            isStatusMention = isStatusMention || !!rawMsg.extendedTextMessage?.contextInfo?.forwardedNewsletterMessageInfo;
            isStatusMention = isStatusMention || !!(rawMsg.conversation && rawMsg.contextInfo?.forwardedNewsletterMessageInfo);
            isStatusMention = isStatusMention || !!rawMsg.imageMessage?.contextInfo?.forwardedNewsletterMessageInfo;
            isStatusMention = isStatusMention || !!rawMsg.videoMessage?.contextInfo?.forwardedNewsletterMessageInfo;
            isStatusMention = isStatusMention || !!rawMsg.contextInfo?.forwardedNewsletterMessageInfo;
            isStatusMention = isStatusMention || !!(rawMsg.contextInfo?.isForwarded && rawMsg.contextInfo?.forwardingScore);
            // Verified signals from a working reference implementation:
            isStatusMention = isStatusMention || (Array.isArray(ctxAGM.groupMentions) && ctxAGM.groupMentions.length > 0);
            isStatusMention = isStatusMention || !!ctxAGM.isSampled;
            isStatusMention = isStatusMention || (ctxAGM.mentionedJid || []).some(j => String(j).endsWith('@g.us'));
            isStatusMention = isStatusMention || /@everyone\b/i.test(text) || /@group\b/i.test(text); */

                if (m.message?.groupStatusMentionMessage && !m.fromMe) {
                return await this._doAction(groupId, userId, agmSettings, 'Group mentions are not allowed', m);
            }
        }

        // Anti-GC-Status (per-group, off by default)
        // Detects an actual native "group status post" — a member posting
        // directly to the group's status/updates feed. The real field for
        // this is `groupStatusMessageV2` on the raw message (verified against
        // a working reference bot, SUKUNA_MD). This is a DIFFERENT feature
        // from Anti-Group-Mention above (which is about @everyone/@group tags
        // and forwarded mentions inside normal chat messages).
        //
        // Uses the SAME enabled/action(delete|warn|kick) system as every
        // other anti-system here (via _settings()/_doAction()), so warnings
        // accumulate consistently and the command surface matches
        // .antilink / .antiforwarding / .antiword etc. A group status post
        // needs a special key shape to actually revoke on WhatsApp's side
        // (different Baileys forks want different shapes), so that reliable
        // multi-method delete still runs as a pre-step before handing off
        // to _doAction() for the standard delete/warn/kick bookkeeping.
        const agcsSettings = this._settings('./database/antigcstatus.json', groupId);
        if (agcsSettings.enabled) {
            // BUG (was): checked `(m.msg || m.message).groupStatusMessageV2`.
            // messageHandler.smsg() already sets `m.msg = msg.message[type]`,
            // so when the type IS groupStatusMessageV2, m.msg is already the
            // *unwrapped content* of that field, not a wrapper containing a
            // `.groupStatusMessageV2` property — that lookup was always
            // undefined and this feature could never fire. The correct check
            // is m.type (set from getContentType) or the raw m.message object.
            const raw = m.message || m.msg || {};
            const isGroupStatusPost = [
                m.type,
                m.messageType,
                m.key?.messageType,
                Object.keys(m.message || {})[0],
                Object.keys(m.msg || {})[0],
            ].some((type) => String(type || '').toLowerCase().replace(/[^a-z0-9]/g, '')
                .includes('groupstatusmessage')) ||
                Boolean(raw.groupStatusMessageV2 || raw.groupStatusMessage || raw.groupStatus);

            if (isGroupStatusPost) {
                const sock = this.bot.sock;
                const statusKey = {
                    ...(m.key || {}),
                    remoteJid: groupId,
                    fromMe: false,
                    id: m.key?.id,
                    participant: userId || m.sender,
                };
                try { await sock.sendMessage(groupId, { delete: statusKey }); } catch {}
                try {
                    if (typeof sock.groupRevokeStatus === 'function') {
                        await sock.groupRevokeStatus(groupId, m.key.id);
                    }
                } catch {}
                try {
                    await sock.sendMessage(groupId, { protocolMessage: { key: statusKey, type: 0 } }); // REVOKE
                } catch {}
                try {
                    await sock.sendMessage(groupId, { delete: { ...statusKey, fromMe: true } });
                } catch {}

                return await this._doAction(groupId, userId, agcsSettings, 'Group status posts are not allowed', m);
            }
        }

        // Anti-Bot (detect & kick bot accounts)
        // Real, reliable signal: the shape of the message ID itself.
        // Baileys (and most bot libraries) generate IDs like "3EB0" + 16 hex
        // chars = 20 chars total; the official WhatsApp app never produces
        // an ID shaped that way. messageHandler.smsg() now sets
        // m.isBot / m.isBaileys from that pattern, so use it directly.
        //
        // BUG (previous fix): checked the multi-device JID suffix instead,
        // but that suffix gets stripped off m.sender before antiSystems ever
        // sees it, so it could never match. The message-ID signal doesn't
        // depend on the sender JID at all, so it isn't affected by that.
        const abSettings = this._settings('./database/antibot.json', groupId);
        if (abSettings.enabled) {
            const isBot = (m.isBot || m.isBaileys) && !m.fromMe;
            if (isBot) {
                return await this._doAction(groupId, userId, abSettings, 'Bots are not allowed', m);
            }
        }

        // Block-Sticker (per-sticker content ban, always enforced when a hash
        // is on the list — set via commands/admin/blocksticker.js). This is
        // SUKUNA_MD's `mutesticker` feature ported under a non-conflicting
        // name, since this bot's own `mutesticker` means something different
        // (muting a USER's stickers, not banning a specific sticker image).
        if (m.type === 'stickerMessage' && m.msg?.fileSha256) {
            const blockedDb = this._readDB('./database/blockedstickers.json');
            const blockedList = blockedDb[groupId] || [];
            if (blockedList.length) {
                const hash = Buffer.from(m.msg.fileSha256).toString('base64');
                if (blockedList.includes(hash)) {
                    await this._tryDelete(m);
                    return true;
                }
            }
        }

        // Anti-Word (banned words detection)
        const awSettings = this._settings('./database/antiword.json', groupId);
        if (awSettings.enabled && awSettings.words && Array.isArray(awSettings.words)) {
            // Normalize BOTH sides the same way so a banned emoji matches
            // regardless of variation-selector/skin-tone differences
            // between how it was added and how it was actually sent.
            const msgText = this._normalizeEmojiText(text).toLowerCase();
            for (const word of awSettings.words) {
                const needle = this._normalizeEmojiText(word).toLowerCase();
                if (needle && msgText.includes(needle)) {
                    return await this._doAction(groupId, userId, awSettings, `Banned word used: "${word}"`, m);
                }
            }
        }

        // Anti-Scam (investment fraud, fake giveaways, phishing, loan/mule
        // scams, crypto/forex scams, fake job offers — lib/antiPatterns.js)
        const ascSettings = this._settings('./database/antiscam.json', groupId);
        if (ascSettings.enabled && text) {
            const scamHit = detectScam(text);
            if (scamHit) {
                return await this._doAction(groupId, userId, ascSettings, `Suspected scam message (${scamHit})`, m);
            }
        }

        // Anti-Beg (begging/solicitation messages — lib/antiPatterns.js)
        const abgSettings = this._settings('./database/antibeg.json', groupId);
        if (abgSettings.enabled && text) {
            if (detectBeg(text)) {
                return await this._doAction(groupId, userId, abgSettings, 'Begging/solicitation not allowed', m);
            }
        }

        // Anti-Video (videos, video notes and GIFs from non-admins)
        const avSettings = this._settings('./database/antivideo.json', groupId);
        if (avSettings.enabled && (m.type === 'videoMessage' || m.type === 'ptvMessage')) {
            return await this._doAction(groupId, userId, avSettings, 'Videos are not allowed', m);
        }

        // Anti-Sticker (every sticker from non-admins; mutesticker bans one specific hash)
        const anyStickerSettings = this._settings('./database/antisticker.json', groupId);
        if (anyStickerSettings.enabled && m.type === 'stickerMessage') {
            return await this._doAction(groupId, userId, anyStickerSettings, 'Stickers are not allowed', m);
        }

        // Anti-ViewOnce (any view-once photo/video/voice note from non-admins)
        const vvSettings = this._settings('./database/antivv.json', groupId);
        if (vvSettings.enabled && (m.viewOnce === true || /^viewOnceMessage/.test(m.type || '') || m.msg?.viewOnce === true)) {
            return await this._doAction(groupId, userId, vvSettings, 'View-once messages are not allowed', m);
        }

        // Anti-VoiceNote (voice notes, including view-once ones, from non-admins)
        const vnSettings = this._settings('./database/antivn.json', groupId);
        if (vnSettings.enabled && (m.type === 'audioMessage' || m.viewOnceType === 'audioMessage') && m.msg?.ptt) {
            return await this._doAction(groupId, userId, vnSettings, 'Voice notes are not allowed', m);
        }

        // Anti-Forwarding (detect forwarded messages)
        const afSettings = this._settings('./database/antiforwarding.json', groupId);
        if (afSettings.enabled) {
            const rawMsg = m.msg || m.message || {};
            const isForwarded = rawMsg.contextInfo?.isForwarded || 
                               !!(rawMsg.contextInfo?.forwardingScore && rawMsg.contextInfo?.forwardingScore > 0);
            if (isForwarded) {
                return await this._doAction(groupId, userId, afSettings, 'Forwarded messages are not allowed', m);
            }
        }

        // ── Newer anti-systems (each has its own ./database/<name>.json) ───────
        // Effective content type: look through view-once wrappers.
        const t = (m.viewOnce && m.viewOnceType) ? m.viewOnceType : m.type;

        // AntiImage / AntiAudio / AntiDoc / AntiPoll / AntiEvent /
        // AntiLocation / AntiContact — pure message-type bans.
        for (const key of TYPE_KEYS) {
            const st = this._settings(dbOf(key), groupId);
            if (!st.enabled) continue;
            if (FEATURES[key].match(m, t)) {
                return await this._doAction(groupId, userId, st, FEATURES[key].reason, m);
            }
        }

        // AntiNewcomerLinks — links from members who joined < N minutes ago.
        const nl = this._settings(dbOf('antinewcomerlinks'), groupId);
        if (nl.enabled && text && this._linkRegex().test(text)) {
            const windowMs = Math.min(Math.max(nl.minutes || 10, 1), 60) * 60 * 1000;
            const joinedAt = this._joinedAt(groupId, [userId, m._participantRaw, m.key?.participant, m.key?.participantAlt]);
            if (joinedAt && Date.now() - joinedAt < windowMs) {
                return await this._doAction(groupId, userId, nl, 'New members cannot post links yet', m);
            }
        }

        return false;
    }

    // Called from app.js#handleGroupUpdate() on every 'add' (join) event —
    // handles Anti-Fake, .bancountry, and .akick in one pass over the
    // joining participants. Anti-Fake and .bancountry both live here
    // because neither has a "message" to act on (there's nothing to
    // delete/quote on a join), unlike every other anti-system above.
    //
    // BUG (found, both pre-existing): antifake.js used to export its own
    // onGroupParticipantsUpdate() hook and akick.js relied on akickStore
    // alone — but nothing in this codebase's event wiring ever called
    // either on a real join, so neither one actually did anything. This
    // method is the thing that's actually invoked, so both now work.
    async checkGroupJoin(groupId, participants) {
        try {
            const botIsAdmin = await Promise.race([
                this._isBotAdmin(groupId),
                new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
            ]);
            if (!botIsAdmin) return;

            const akickStore     = require('./akickStore');
            const bancountryStore = require('./bancountryStore');

            const afSettings  = this._settings('./database/antifake.json', groupId);
            const bannedCodes = bancountryStore.list(groupId);
            const raidCfg     = this._settings(dbOf('antiraid'), groupId);
            const newcomerOn  = !!this._settings(dbOf('antinewcomerlinks'), groupId).enabled;
            const joinNow     = Date.now();

            for (const raw of (participants || [])) {
                const userId = typeof raw === 'string' ? raw : (raw?.id || raw?.jid || '');
                if (!userId) continue;

                // AntiNewcomerLinks: remember when this member arrived, under
                // every id form WhatsApp may later use for them (phone/LID).
                if (newcomerOn) {
                    const ids = typeof raw === 'string' ? [raw] : [raw?.id, raw?.jid, raw?.lid, raw?.phoneNumber];
                    for (const id of ids) {
                        const k = this._userKey(id);
                        if (k) this._joinTimes.set(`${groupId}_${k}`, joinNow);
                    }
                }

                // Never act on the bot itself, the owner, or a mod —
                // matches the same exemption every message-based
                // anti-system already grants them.
                if (this.bot.permission.isBotSelf(userId)) continue;
                if (this.bot.permission.isOwner(userId)) continue;
                if (this.bot.permission.isMod(userId)) continue;

                // 1) Auto-kick list — instant, silent-ish removal.
                if (akickStore.isListed(groupId, userId)) {
                    await this._kick(groupId, userId);
                    await this.bot.sendMessage(groupId, {
                        text: `🚫 @${userId.split('@')[0]} was removed — they're on this group's auto-kick list.`,
                        mentions: [userId]
                    });
                    continue;
                }

                // 2) Banned country codes — instant kick, exact wording
                // requested: "Kicking @user now\nReason: ..."
                if (bannedCodes.length) {
                    const code = matchCode(userId);
                    if (code && bannedCodes.includes(code)) {
                        await this._kick(groupId, userId);
                        await this.bot.sendMessage(groupId, {
                            text: `Kicking @${userId.split('@')[0]} now\nReason: +${code} is not allowed in the group.`,
                            mentions: [userId]
                        });
                        continue;
                    }
                }

                // 2b) AntiRaid — N+ joins inside the window = a raid. Everyone
                // who joined inside the window is removed, and any further
                // joiner is removed on arrival until the window has passed.
                if (raidCfg.enabled && await this._raidCheck(groupId, userId, raidCfg)) continue;

                // 3) Anti-Fake — unrecognized/fake phone numbers. Goes
                // through the same _doAction() warn/kick + maxWarns-cap
                // engine as every message-based anti-system, just with no
                // message to quote/delete (m: null, quote: false).
                if (afSettings.enabled && !hasValidCode(userId)) {
                    await this._doAction(groupId, userId, afSettings, 'Unrecognized/fake phone number', null, false);
                }
            }
        } catch {}
    }

    // ── helpers shared by the newer anti-systems ────────────────────────────

    // Digits-only identity for join-time lookups (phone and LID alike).
    _userKey(jid) {
        return String(jid || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
    }

    _joinedAt(groupId, jids) {
        for (const j of jids) {
            const k = this._userKey(j);
            if (!k) continue;
            const t = this._joinTimes.get(`${groupId}_${k}`);
            if (t) return t;
        }
        return 0;
    }

    // Removes several members in one request, falling back to one-by-one.
    async _kickMany(groupId, ids) {
        if (!ids.length) return;
        try { await this.bot.sock.groupParticipantsUpdate(groupId, ids, 'remove'); return; } catch {}
        for (const id of ids) await this._kick(groupId, id);
    }

    // Owner / mod / sudo / the bot itself — never actioned by any anti-system.
    // Also resolves the owner's @lid, which a digits match alone can't.
    async _isTrusted(jids) {
        const list = (jids || []).filter(Boolean);
        const perm = this.bot.permission;
        for (const j of list) {
            if (perm.isBotSelf(j) || perm.isOwner(j) || perm.isMod(j) || perm.isSudo?.(j)) return true;
        }
        try {
            const ownerRaw   = this.bot.config.owner;
            const ownerPhone = ((typeof ownerRaw === 'object' ? ownerRaw?.number : ownerRaw) || '').replace(/[^0-9]/g, '');
            if (ownerPhone) {
                const ownerLid = await this.bot.sock.signalRepository?.lidMapping?.getLIDForPN(ownerPhone + '@s.whatsapp.net');
                const norm = (j) => String(j || '').replace(/:[0-9]+@/, '@').toLowerCase();
                if (ownerLid && list.some((j) => norm(j) === norm(ownerLid))) return true;
            }
        } catch {}
        return false;
    }

    // ModLog — appends one entry per anti-system action when .modlog is on
    // for that group; entries older than the retention window (default 30
    // days) and anything beyond a per-group cap are dropped on write.
    _modLog(groupId, userId, action, reason) {
        try {
            if (!groupId || !String(groupId).endsWith('@g.us')) return;
            const cfg = this._settings(dbOf('modlog'), groupId);
            if (!cfg.enabled) return;
            const now  = Date.now();
            const keep = Math.min(Math.max(cfg.days || 30, 1), 90) * 24 * 60 * 60 * 1000;
            const db   = this._readDB(MODLOG_PATH);
            const arr  = (Array.isArray(db[groupId]) ? db[groupId] : []).filter((e) => now - e.t < keep);
            arr.push({ t: now, user: userId, action, reason });
            db[groupId] = arr.slice(-MODLOG_MAX_PER_GROUP);
            this._writeDB(MODLOG_PATH, db);
        } catch {}
    }

    // AntiRaid — returns true when this joiner was removed as part of a raid.
    async _raidCheck(groupId, userId, cfg) {
        const now      = Date.now();
        const windowMs = Math.min(Math.max(cfg.minutes || 10, 1), 120) * 60 * 1000;
        const limit    = Math.min(Math.max(cfg.count || 5, 2), 50);
        const st       = this._raidState.get(groupId) || { joins: [], until: 0 };
        this._raidState.set(groupId, st);

        // Raid already declared: remove every newcomer until it passes.
        if (st.until > now) {
            this._modLog(groupId, userId, 'kick', 'AntiRaid: joined during a raid');
            await this._kick(groupId, userId);
            return true;
        }

        st.joins = st.joins.filter((j) => now - j.t < windowMs);
        st.joins.push({ t: now, id: userId });
        if (st.joins.length < limit) return false;

        const raiders = [...new Set(st.joins.map((j) => j.id))];
        st.joins = [];
        st.until = now + windowMs;
        for (const id of raiders) this._modLog(groupId, id, 'kick', 'AntiRaid: mass join');
        await this._kickMany(groupId, raiders);
        try {
            await this.bot.sock.sendMessage(groupId, {
                text: `🚨 Raid detected — ${raiders.length} members joined within ${Math.round(windowMs / 60000)} min and were removed.\nNew joins are removed for the next ${Math.round(windowMs / 60000)} min.`,
                mentions: raiders,
            });
        } catch {}
        return true;
    }

    // AntiPromote — called from app.js#handleGroupUpdate for every 'promote'
    // event. The owner, mods and the bot itself (incl. the .promote command and
    // this feature's own reverts) are always allowed; anyone else's promotion
    // is reverted. Without a known actor nothing is touched, because the bot
    // can't tell its own work from a stranger's.
    async checkAdminChange(groupId, participants, action, author, authorPn) {
        try {
            if (action !== 'promote') return;
            const st = this._settings(dbOf('antipromote'), groupId);
            if (!st.enabled) return;
            if (!author && !authorPn) return;
            if (await this._isTrusted([author, authorPn])) return;

            const authorKey = this._userKey(authorPn || author);
            const targets = [];
            for (const raw of (participants || [])) {
                const id = typeof raw === 'string' ? raw : (raw?.id || raw?.jid || raw?.phoneNumber || '');
                if (!id) continue;
                if (this._userKey(id) === authorKey) continue;
                if (await this._isTrusted([id])) continue;   // never demote the owner/mods/bot
                targets.push(id);
            }
            if (!targets.length) return;

            const botIsAdmin = await Promise.race([
                this._isBotAdmin(groupId),
                new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
            ]);
            if (!botIsAdmin) return;

            await this.bot.sock.groupParticipantsUpdate(groupId, targets, 'demote');
            const actor = author || authorPn;
            for (const id of targets) this._modLog(groupId, actor, 'demote', `AntiPromote: reverted promotion of @${this._userKey(id)}`);
            await this.bot.sock.sendMessage(groupId, {
                text: `🚩 @${String(actor).split('@')[0]}\nPromotions are not allowed here — the promoted member has been demoted again.`,
                mentions: [actor],
            });
        } catch {}
    }

    // ── AntiBug ──────────────────────────────────────────────────────────────
    // OFF by default. Default mode is DM: once switched on (.antibug on in the
    // bot's DM, or .antibug global on) it protects DMs only. A group is only
    // protected when an admin runs .antibug on in it, or when the owner sets
    // .antibug mode group|both.
    _bugEnabled(chat, isGroup) {
        const db = this._readDB(BUG_PATH);
        const mode = ['dm', 'group', 'both'].includes(db._mode) ? db._mode : null;   // null = default (DM)
        const own = isGroup && db[chat] && typeof db[chat].enabled === 'boolean' ? db[chat].enabled : null;
        const globalOn = !!(db._global && db._global.enabled === true);

        if (mode === 'dm' && isGroup) return false;
        if (mode === 'group' && !isGroup) return false;
        if (own !== null) return own;
        if (mode === null && isGroup) return false;   // default mode: groups need their own .antibug on
        return globalOn;
    }

    // Called from messageHandler.handle() for EVERY chat, before the group
    // gate and before the bot touches the message at all. Returns true when
    // the message was a bug/flood and has been handled (caller must stop).
    // Owner, mods and sudo are exempt; group admins are NOT — an admin can
    // send a crash payload just as easily as anyone else.
    async checkBug(m) {
        try {
            if (!m || !m.message || m.fromMe || m.key?.fromMe) return false;
            if (m.chat === 'status@broadcast') return false;
            const sender = m.sender;
            if (!sender) return false;
            if (!this._bugEnabled(m.chat, m.isGroup)) return false;
            if (await this._isTrusted([sender, m._participantRaw, m.key?.participant, m.key?.participantAlt])) return false;

            // Already blocked a moment ago: just keep clearing their messages.
            const blockedAt = this._bugBlocked.get(sender);
            if (blockedAt && Date.now() - blockedAt < 10 * 60 * 1000) {
                if (m.isGroup) await this._tryDelete(m);
                return true;
            }

            const reason = detectBug(m.message, { sender, floods: this._bugFloods });
            if (!reason) return false;

            await this._blockBugSender(m, reason);
            return true;
        } catch {
            return false;
        }
    }

    // The AntiBug action: BLOCK immediately. The payload is deleted (groups),
    // the sender is blocked on WhatsApp, and — in groups where the bot is
    // admin — removed so the flood can't carry on from inside the group.
    async _blockBugSender(m, reason) {
        const sock    = this.bot.sock;
        const sender  = m.sender;
        const chat    = m.chat;
        const isGroup = !!m.isGroup;
        this._bugBlocked.set(sender, Date.now());
        console.log(`[AntiBug] ${reason} from ${sender} in ${chat} — blocking`);

        if (isGroup) await this._tryDelete(m);

        // Block on WhatsApp. Try every JID form we have for the sender.
        const candidates = [...new Set([
            isGroup ? sender : chat,
            sender,
            m.key?.participantAlt,
            m.key?.participant,
            m.key?.remoteJidAlt,
        ].filter(Boolean))];
        let blocked = false;
        for (const jid of candidates) {
            try { await sock.updateBlockStatus(jid, 'block'); blocked = true; break; } catch {}
        }

        if (isGroup) {
            const botIsAdmin = await Promise.race([
                this._isBotAdmin(chat),
                new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
            ]);
            if (botIsAdmin) await this._kick(chat, sender);

            this._modLog(chat, sender, 'block', `AntiBug: ${reason}`);

            // One notice per sender per minute — the notice must never become
            // the flood.
            const nk = `${chat}|${sender}`;
            const last = this._bugNotified.get(nk) || 0;
            if (Date.now() - last > 60 * 1000) {
                this._bugNotified.set(nk, Date.now());
                try {
                    await sock.sendMessage(chat, {
                        text: `🚫 @${sender.split('@')[0]} was blocked${botIsAdmin ? ' and removed' : ''}.\nReason: bug/crash message detected (${reason})`,
                        mentions: [sender],
                    });
                } catch {}
            }
        }
        return blocked;
    }

    async checkStatusGroupMention(statusSender, mentionedGroupJid) {
        const db       = this._readDB('./database/antigroupmention.json');
        const settings = db[mentionedGroupJid];
        if (!settings?.enabled) return;
        if (this.bot.permission.isOwner(statusSender) || this.bot.permission.isMod(statusSender)) return;

        const botIsAdmin = await this._isBotAdmin(mentionedGroupJid);
        if (!botIsAdmin) return;

        const action   = settings.action   || 'warn';
        // Cap warnings at 3 maximum (not 1-10)
        const maxWarns = Math.min(Math.max(settings.maxWarns || 3, 1), 3);

        if (action === 'kick') {
            await this._kick(mentionedGroupJid, statusSender);
            await this.bot.sendMessage(mentionedGroupJid, {
                text: `@${statusSender.split('@')[0]} was removed.\nReason: Mentioned this group in their WhatsApp status.`,
                mentions: [statusSender]
            });
        } else if (action === 'warn') {
            const warnPath = './database/warnings.json';
            let warns = this._readDB(warnPath);
            const key = `${mentionedGroupJid}_${statusSender}`;
            if (!warns[key] || typeof warns[key] === 'number') {
                warns[key] = { count: typeof warns[key] === 'number' ? warns[key] : 0, history: [] };
            }
            warns[key].count++;
            warns[key].history.push({
                reason: 'Mentioned group in status', issuer: 'Auto', issuerName: 'System',
                time: new Date().toLocaleString('en-NG', { timeZone: tz.get(), hour12: true })
            });
            const count = warns[key].count;
            this._writeDB(warnPath, warns);
            if (count >= maxWarns) {
                await this._kick(mentionedGroupJid, statusSender);
                warns[key] = { count: 0, history: [] };
                this._writeDB(warnPath, warns);
                await this.bot.sendMessage(mentionedGroupJid, {
                    text: `⛔ @${statusSender.split('@')[0]} removed after ${maxWarns}/${maxWarns} warnings.\nReason: Kept mentioning this group in WhatsApp status.`,
                    mentions: [statusSender]
                });
            } else {
                await this.bot.sendMessage(mentionedGroupJid, {
                    text: `⚠️ Warning ${count}/${maxWarns} — @${statusSender.split('@')[0]}\nReason: Mentioned this group in their status.`,
                    mentions: [statusSender]
                });
            }
        } else if (action === 'delete') {
            await this.bot.sendMessage(mentionedGroupJid, {
                text: `📢 @${statusSender.split('@')[0]} mentioned this group in their WhatsApp status.`,
                mentions: [statusSender]
            });
        }
    }
}

// ── Public engine API used by the toggle commands ──────────────────────────
AntiSystems.FEATURES = FEATURES;
AntiSystems.dbOf = dbOf;
AntiSystems.readJSON = readJSON;
AntiSystems.writeJSON = writeJSON;

AntiSystems.readModLog = (groupId) => {
    const arr = readJSON(MODLOG_PATH)[groupId];
    return Array.isArray(arr) ? arr : [];
};
AntiSystems.clearModLog = (groupId) => {
    const db = readJSON(MODLOG_PATH);
    delete db[groupId];
    writeJSON(MODLOG_PATH, db);
};

const _bugOn = (groupId) => {
    const db = readJSON(BUG_PATH);
    if (db[groupId] && typeof db[groupId].enabled === 'boolean') return db[groupId].enabled;
    return !!(db._global && db._global.enabled === true);
};
const _act = (s) => {
    const a = (s.action || 'warn').toLowerCase();
    return a === 'warn' ? `warn ${Math.min(Math.max(s.maxWarns || 3, 1), 3)}` : a;
};

// The ".antis" panel — one line per anti-system, in the owner's order.
AntiSystems.buildPanel = (groupId) => {
    const get = (key) => readJSON(dbOf(key))[groupId] || {};
    const line = (label, key, fmt) => {
        const s = get(key);
        return `• ${label}: ${s.enabled ? 'ON' : 'OFF'}${fmt ? ' ' + fmt(s) : ''}`;
    };
    const act  = (s) => `(${_act(s)})`;
    return [
        line('AntiLink', 'antilink', act),
        line('AntiGM', 'antigroupmention', act),
        line('AntiBot', 'antibot', act),
        line('AntiForward', 'antiforwarding', act),
        line('AntiGroupStatus', 'antigcstatus', act),
        line('AntiWord', 'antiword', act),
        line('AntiTag', 'antitag', act),
        line('AntiSpam', 'antispam', act),
        line('AntiVV', 'antivv', act),
        `• AntiBug: ${_bugOn(groupId) ? 'ON' : 'OFF'} (block)`,
        line('AntiImage', 'antiimage', act),
        line('AntiVideo', 'antivideo', act),
        line('AntiAudio', 'antiaudio', act),
        line('AntiVoice', 'antivn', act),
        line('AntiDoc', 'antidoc', act),
        line('AntiPoll', 'antipoll', act),
        line('AntiEvent', 'antievent', act),
        line('AntiNewcomerLinks', 'antinewcomerlinks', (s) => `(${s.minutes || 10}m)`),
        line('AntiRaid', 'antiraid', (s) => `(${s.count || 5}/${s.minutes || 10}m)`),
        line('AntiLocation', 'antilocation', act),
        line('AntiContact', 'anticontact', act),
        line('ModLog', 'modlog', (s) => `(${s.days || 30}d retention)`),
        line('NoSticker', 'antisticker', act),
        line('AntiPromote', 'antipromote'),
    ].join('\n');
};

// ".antis preset" — the exact configuration the owner specified.
const PRESET = {
    antilink:          { enabled: true,  action: 'delete' },
    antigroupmention:  { enabled: true,  action: 'delete' },
    antibot:           { enabled: false, action: 'delete' },
    antiforwarding:    { enabled: true,  action: 'delete' },
    antigcstatus:      { enabled: true,  action: 'kick'   },
    antiword:          { enabled: false, action: 'delete' },
    antitag:           { enabled: false, action: 'delete' },
    antispam:          { enabled: true,  action: 'delete' },
    antivv:            { enabled: false, action: 'delete' },
    antiimage:         { enabled: false, action: 'delete' },
    antivideo:         { enabled: false, action: 'delete' },
    antiaudio:         { enabled: false, action: 'delete' },
    antivn:            { enabled: false, action: 'delete' },
    antidoc:           { enabled: false, action: 'delete' },
    antipoll:          { enabled: false, action: 'delete' },
    antievent:         { enabled: false, action: 'delete' },
    antinewcomerlinks: { enabled: true,  action: 'delete', minutes: 10 },
    antiraid:          { enabled: true,  count: 5, minutes: 10 },
    antilocation:      { enabled: false, action: 'delete' },
    anticontact:       { enabled: false, action: 'delete' },
    modlog:            { enabled: false, days: 30 },
    antisticker:       { enabled: false, action: 'delete' },
    antipromote:       { enabled: true },
};
AntiSystems.applyPreset = (groupId) => {
    for (const [key, patch] of Object.entries(PRESET)) {
        const file = dbOf(key);
        const db = readJSON(file);
        db[groupId] = { ...(patch.action ? { maxWarns: 3 } : {}), ...(db[groupId] || {}), ...patch };
        writeJSON(file, db);
    }
    const bug = readJSON(BUG_PATH);
    bug[groupId] = { enabled: true };
    writeJSON(BUG_PATH, bug);
};

// Per-message features join the cheap "anything on in this group?" check.
for (const key of MESSAGE_KEYS) AntiSystems.ACTIVE_FEATURE_DBS.push(dbOf(key));

module.exports = AntiSystems;



        



