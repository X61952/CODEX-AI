const { autoReadAllows } = require("./autoRead");
const { getContentType, downloadContentFromMessage } = require("./baileys");
const fs = require("fs-extra");
const path = require("path");
const tz = require("./timezone");

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');
const STICKER_COMMANDS_DB = path.join(PROJECT_ROOT, 'database', 'sticker_cmds.json');


class MessageHandler {
  constructor(bot) {
    this.bot = bot;
    // Messages are handled strictly one at a time, so ONE stuck handler used to
    // freeze every chat for 2 minutes before the queue moved on. Wait at most 20s
    // instead (override with MESSAGE_HANDLER_TIMEOUT_MS). A slow command isn't
    // cancelled — it just stops blocking the next message.
    if (!(Number(bot._messageHandlerTimeoutMs) > 0)) {
      bot._messageHandlerTimeoutMs = Number(process.env.MESSAGE_HANDLER_TIMEOUT_MS) || 20000;
    }
    // Resets a Signal session that keeps failing with "Bad MAC" (lib/badMacHeal.js).
    try { require("./badMacHeal").init(bot); } catch (e) { console.error("[bad-mac-heal] not started:", e.message); }
  }

  // Starts (once) a periodic sweep that fully clears the dedup Set every 5
  // minutes, replacing the old one-setTimeout-per-message approach. Since
  // dedup only needs to catch near-simultaneous duplicate deliveries of the
  // same message (not a long-term history), clearing the whole set
  // periodically is just as effective and far cheaper than tracking
  // individual per-ID expiry.
  _startDedupSweep() {
    if (this._dedupSweepTimer) return;
    this._dedupSweepTimer = setInterval(() => {
      if (this._processedIds) this._processedIds.clear();
    }, 5 * 60 * 1000);
    this._dedupSweepTimer.unref?.();
  }

  // Build a 3rd argument that satisfies BOTH command signatures:
  //   execute(bot, m, args)                         → args used as a plain array
  //   execute(sock, m, { args, reply, prefix })     → destructured object
  // Returns a real Array (indexing/length intact) carrying extra properties.
  _argv(m, args) {
    const argv = Array.isArray(args) ? args.slice() : [];
    argv.args = argv;
    // Defensive: m.reply is set once, near the end of message parsing.
    // If any deployment ever ends up with a mismatched/partial file set
    // (e.g. an older parsing path that returns before m.reply is attached),
    // commands destructuring `{ reply }` here would otherwise fail with a
    // bare "reply is not a function" — this fallback goes straight to
    // bot.sendMessage so replies keep working even in that situation,
    // instead of every game command silently depending on m.reply existing.
    argv.reply = typeof m?.reply === 'function'
      ? (t, o = {}) => m.reply(t, o)
      : (t, o = {}) => this.bot.sendMessage(m?.chat, { text: String(t), ...o }, m?.key ? { quoted: m } : {});
    argv.prefix = this.bot.prefix;
    argv.sock = this.bot.sock;
    argv.bot = this.bot;
    return argv;
  }

  // Centralised command runner so every entry point behaves identically.
  // NOTE: this used to also strip emoji ranges from every command reply,
  // which silently deleted any emoji a command was actually trying to
  // show (e.g. `.mention -react ✅` or `.setvar STATUS_EMOJI=✅` echoing
  // the emoji back in their acknowledgement). It now only tidies up
  // whitespace and leaves the text's actual content — emoji included —
  // untouched.
  _cleanCommandReply(value) {
    return String(value ?? '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .trim();
  }

  _commandContext() {
    const bot = this.bot;
    const socket = bot.sock;
    const context = Object.create(bot);
    context.sock = socket;
    for (const method of [
      'sendMessage',
      'groupMetadata',
      'groupParticipantsUpdate',
      'presenceSubscribe',
      'readMessages',
      'relayMessage',
      'copyNForward',
      'forwardMessage',
      'updateProfilePicture',
      'updateProfileName',
      'updateProfileStatus',
      'removeProfilePicture',
      'reportContact',
      'onWhatsApp',
      'getStatus',
      'sendReceipt',
    ]) {
      if (typeof socket?.[method] === 'function') context[method] = socket[method].bind(socket);
    }
    return context;
  }

  // ── Send a command error report straight to the owner's DM ─────────────────
  // Command failures used to only land in the console, which nobody is
  // watching on a hosted panel — the owner would only find out something
  // broke when a user complained. This mirrors that report to the owner's
  // own chat instead, with full context (who ran what, where, when) so
  // problems get noticed and fixed immediately.
  async _reportErrorToOwner(err, m, cmdName, args) {
    try {
      // Rate-limit: at most one error DM to the owner per 5 minutes.
      // Previously this fired on every single command failure — with
      // ~2000 commands loaded, one plugin with a recurring bug (bad regex,
      // a flaky third-party API) could spam the owner's DM with hundreds
      // of near-identical error reports in a short window. The console
      // still logs every failure (see the catch blocks that call this);
      // only the owner DM is throttled.
      const now = Date.now();
      if (this._lastErrorReportAt && now - this._lastErrorReportAt < 5 * 60 * 1000) {
        return;
      }
      this._lastErrorReportAt = now;

      const ownerRaw = (typeof this.bot.config.owner === 'object')
        ? (this.bot.config.owner.number || '')
        : (this.bot.config.owner || '');
      const ownerDigits = String(ownerRaw).replace(/[^0-9]/g, '');
      if (!ownerDigits) return;
      const ownerJid = ownerDigits + '@s.whatsapp.net';

      // Never DM ourselves an error that happened from a message the owner
      // sent from their own DM to the bot's DM — pointless echo.
      if (m.chat === ownerJid && !m.isGroup) return;

      const senderNum = (m.sender || '').split('@')[0];
      const pushName = m.pushName || 'Unknown';
      const chatLabel = m.isGroup ? `${m.chat} (Group)` : `${m.chat} (DM)`;
      const timeStr = new Date().toLocaleString('en-US', {
        timeZone: tz.get(),
      });
      const stack = (err?.stack || err?.message || String(err)).slice(0, 3500);
      const commandLine = args && args.length ? `${cmdName} ${args.join(' ')}` : (cmdName || 'unknown');

      // Default title reads "CODEX ERROR" — but once the owner personalizes
      // the bot's name away from the shipped default, the report should
      // reflect that instead of staying hardcoded to a name they changed.
      const rawName = String(this.bot.config?.botName || 'CODEX AI').trim();
      const isDefaultName = /^codex[\s-]?ai\b/i.test(rawName) || /^codex\b/i.test(rawName);
      const errorTitle = isDefaultName ? 'CODEX' : rawName.toUpperCase();

      const text =
        `*—͟͟͞͞❑ ${errorTitle} ERROR!*\n\n` +
        `*Command:* ${commandLine}\n` +
        `*User:* @${senderNum} (${pushName})\n` +
        `*Chat:* ${chatLabel}\n` +
        `*Time:* ${timeStr}\n\n` +
        `*Error:*\n\`\`\`${stack}\`\`\``;

      await this.bot.sock.sendMessage(ownerJid, {
        text,
        mentions: [m.sender].filter(Boolean),
      }).catch(() => {});
    } catch {
      // Never let error reporting itself throw — that would just create
      // a second, unreported failure on top of the first one.
    }
  }

  async _run(command, m, args, cmdName) {
    // Feeds the "Commands" counter shown by .check and .stats — both
    // read global.codexStats, but nothing anywhere ever wrote to it, so
    // it always showed 0. This is the one place every command execution
    // funnels through (including the bare `$` eval bypass), so it's the
    // right spot to count from.
    global.codexStats = global.codexStats || { messages: 0, commands: 0 };
    global.codexStats.commands++;

    const commandMessage = Object.create(m);
    const originalReply = typeof m.reply === 'function'
      ? m.reply.bind(m)
      : (text, opts = {}) => this.bot.sendMessage(m.chat, { text: String(text), ...opts }, m.key ? { quoted: m } : {});
    commandMessage.reply = (text, ...rest) => originalReply(this._cleanCommandReply(text), ...rest);
    return command.execute(this._commandContext(), commandMessage, this._argv(commandMessage, args), cmdName);
  }

  // Filters out JIDs that represent WhatsApp system/broadcast surfaces
  // rather than a real chat with a real sender — broadcast lists and
  // channel/newsletter updates. These were previously falling through into
  // normal message processing (presence updates, dedup tracking, command
  // parsing) even though a command can never sensibly be "run" from a
  // broadcast list or a channel post, which wastes cycles and can produce
  // confusing side effects (e.g. attempting to reply into a broadcast
  // list). status@broadcast is handled separately above/below and is NOT
  // filtered here since autoStatus/anti-delete intentionally process it.
  _isSystemJid(jid) {
    if (!jid) return false;
    return jid.endsWith('@broadcast') && jid !== 'status@broadcast'
      || jid.endsWith('@newsletter')
      || jid === '0@s.whatsapp.net';
  }

  async handle(msg) {
    try {
      const m = this.smsg(msg);
      if (!m) return;

      // Feeds the "Messages" counter shown by .check and .stats — see the
      // matching note on _run() above for why this was always stuck at 0.
      global.codexStats = global.codexStats || { messages: 0, commands: 0 };
      global.codexStats.messages++;

      const jid = m.chat;
      const sender = m.sender;
      const text = m.text || "";

      if (this._isSystemJid(jid)) return;

      // ── ANTI-BUG (every chat: DMs and groups) ─────────────────────────
      // Crash/lag payloads and floods (huge channel invites, sticker-pack
      // flooding, status-mention flooding, file flooding, text walls...).
      // Runs FIRST — before activity tracking, auto-read, presence, mute
      // and the group admin/bot-admin gates — because a bug message must be
      // dropped before the bot spends any effort on it, and because it has
      // to work in DMs and in groups where the bot isn't admin. The action
      // is always BLOCK (see lib/antiSystems.js#checkBug).
      if (!msg.key.fromMe) {
        let bugHandled = false;
        try { bugHandled = await this.bot.antiSystems?.checkBug(m); } catch {}
        if (bugHandled) return;
      }

      // Feeds .listonline/.listoffline (see lib/activityStore.js) — a
      // participant's OWN message is unambiguous proof of activity,
      // unlike presence broadcasts which many users hide via privacy
      // settings. key.participantPn is Baileys' resolved phone-number
      // counterpart for a @lid sender, when available — preferring it
      // here means the stored jid is already a real, taggable phone
      // number, with no separate async LID lookup needed later.
      if (m.isGroup) {
        // m.sender already resolves participantAlt/participant to the
        // canonical phone JID used by group member lookups.
        const activityJid = m.sender || msg.key?.participantPn || msg.key?.participant;
        if (activityJid) {
          try { require('./activityStore').recordActivity(jid, activityJid); } catch {}
        }
      }

      // Presence is opt-in and scoped to the active chat. It is sent once per
      // incoming message to avoid timers and presence spam.
      const presenceConfig = this.bot.config;
      if (!msg.key.fromMe && jid && this.bot.sock?.sendPresenceUpdate) {
        if (presenceConfig.autoRecordTyping) {
          await this.bot.sock.sendPresenceUpdate('recording', jid).catch(() => {});
          await new Promise((resolve) => setTimeout(resolve, 350));
          await this.bot.sock.sendPresenceUpdate('composing', jid).catch(() => {});
        } else if (presenceConfig.autoTyping) {
          await this.bot.sock.sendPresenceUpdate('composing', jid).catch(() => {});
        } else if (presenceConfig.autoRecording) {
          await this.bot.sock.sendPresenceUpdate('recording', jid).catch(() => {});
        }
      }

      if (jid === "status@broadcast") {
        await this._handleStatusMention(m);
        return;
      }

      // ── Auto Read ─────────────────────────────────────────────────────
      // Mark every incoming message as read if autoRead is enabled.
      // Runs before everything else, including mode/owner checks.
      if (autoReadAllows(this.bot.config, jid) && !msg.key.fromMe) {
        await this.bot.sock.readMessages([msg.key]).catch(() => {});
      }

      // ── Owner detection ───────────────────────────────────────────────
      // PRIMARY signal: fromMe=true — always means the owner sent this.
      //   Works in GC, DM, and bot DM. LID-proof.
      // FALLBACK: digit tail-match via permission.isOwner() for cases where
      //   the message comes from a known number (non-fromMe DMs, etc.)
      const isOwner = this.bot.permission.isOwner(sender);

      // ── GC BOT ON/OFF — per-group kill switch ───────────────────────────
      // When off for a group, NOTHING else runs for that group, for
      // ANYONE — owner, sudo, mod, everyone — no command dedup tracking,
      // no AFK check, no mute enforcement, no anti-systems, no mode check,
      // no commands, no auto-reply, completely silent, as if the bot
      // weren't in the group at all. There is deliberately NO owner
      // exemption here (unlike every other gate in this file) — that's
      // the whole point of a hard kill switch. The only way back in is
      // the exact `.bot on` command text reaching the normal command
      // dispatcher below, where its own permission check (owner or mod)
      // decides whether THIS specific sender is actually allowed to run
      // it — anyone else typing it just gets the normal permission
      // rejection, same as any other gated command.
      //
      // Welcome/goodbye/promote/demote events (app.js#handleGroupUpdate)
      // are a completely separate code path, not covered by this — see
      // the matching check added there.
      if (m.isGroup) {
        try {
          const fs = require("fs-extra");
          let _botToggle = {};
          try {
            _botToggle = JSON.parse(
              fs.readFileSync("./database/botToggle.json", "utf8"),
            );
          } catch {}
          if (_botToggle[jid]?.enabled === false) {
            const _prefixEsc = this.bot.prefix.replace(
              /[.*+?^${}()|[\]\\]/g,
              "\\$&",
            );
            // Must match the exact "<prefix>bot on" (or an alias) — this is
            // the ONLY command allowed through while the group is off.
            //
            // BUG (was): the second half of this check tested `text.trim()`
            // — which still has the prefix on it, e.g. ".bot on" — against
            // `/^bot\s+on\b/`, a pattern that expects NO prefix. That never
            // matched, so the OR-with-negation collapsed to always true and
            // `.bot on` got blocked along with everything else, permanently
            // locking the group off with no way back in except editing the
            // database file by hand.
            const _botOnRe = new RegExp(
              `^${_prefixEsc}(?:bot|botswitch|gcbot)\\s+on\\b`,
              "i",
            );
            if (!_botOnRe.test(text.trim())) return;
          }
        } catch {}
      }

      // ── OWNER HARD BYPASS — if fromMe, skip ALL checks and run command ─
      // Owner commands always work regardless of mode, mute, or any other check.
      // This covers: GC commands, DM commands, AND bot DM commands.
      /*           if (isOwner) {
                const text2 = m.text || '';
                // Run AFK check first — so owner sending a message disables their AFK
                await this.bot.afkSystem.checkAFK(m).catch(() => {});
                if (!text2.startsWith(this.bot.prefix)) return;
                const args2    = text2.slice(this.bot.prefix.length).trim().split(/ +/);
                const cmdName2 = args2.shift().toLowerCase();
                const command2 = this.bot.commandHandler.getCommand(cmdName2);
                if (!command2) return;
                try {
                    // Owner bypass: run regardless of ownerOnly/adminOnly/groupOnly.
                    await this._run(command2, m, args2, cmdName2);
                } catch (err) {
                    console.error('Owner cmd error:', err);
                    await m.reply(`Error: ${err.message}`).catch(() => {});
                }
                return;
            }
*/
      // ── Command dedup — prevent the same message firing a command twice ──
      // Happens when messages.upsert fires multiple times for the same msg ID.
      // Previously this scheduled one setTimeout per message to remove its
      // own ID after 5 minutes. If the process is busy (heavy command load,
      // event loop lag) those timeouts can queue up and delay, and in the
      // worst case a burst of messages right before a crash/restart loses
      // its cleanup timers entirely, leaving stale entries. A single
      // periodic sweep (started once, see _startDedupSweep below) avoids
      // that per-message timer overhead and gives the same ~5 minute
      // dedup window with a bounded, predictable cost.
      const _msgId = m.key?.id;
      if (_msgId) {
        if (!this._processedIds) this._processedIds = new Set();
        if (this._processedIds.has(_msgId)) return;
        this._processedIds.add(_msgId);
        this._startDedupSweep();
      }


      // ── AFK — runs for ALL messages before any mode/mute restrictions ────
      await this.bot.afkSystem.checkAFK(m).catch(() => {});

      // ── MUTE ENFORCEMENT — auto-delete muted users' messages ─────────────
      // Runs BEFORE the public/private mode gate below, for the exact same
      // reason anti-systems does: this is moderation, not a bot command.
      //
      // BUG (was): this ran AFTER the mode check. In "private" mode, the
      // mode check silently `return`s for anyone who isn't owner/mod/sudo —
      // which is every muted user, by definition. So in private mode, mute
      // enforcement could never even be reached; muted users' messages just
      // stopped getting deleted with zero indication why.
      if (m.isGroup && !m.key.fromMe && !isOwner) {
        try {
          const muteStore = require('./muteStore');
          const candidates = [
            sender,
            m.sender,
            m._participantRaw,
            m.key?.participant,
            m.key?.participantAlt,
            m.key?.remoteJidAlt,
          ].filter(Boolean);
          const muteEntry = candidates
            .map((candidate) => muteStore.getMute(candidate))
            .find(Boolean);
          const isSticker = m.type === 'stickerMessage' ||
            Boolean(m.msg?.fileSha256 && (m.msg?.mimetype || '').includes('webp'));
          if (muteEntry && (!muteEntry.stickersOnly || isSticker)) {
            await this.bot.sock.sendMessage(jid, { delete: m.key }).catch(() => {});
            return;
          }
        } catch {}
      }

      // ── ANTI-SYSTEMS (groups only, non-privileged) ────────────────────
      // Runs BEFORE the public/private mode gate below. Anti-systems are
      // group moderation, not bot commands — they must keep working on
      // regular members even when the bot's command mode is set to
      // "private" (private mode only restricts who can issue COMMANDS;
      // it must never disable moderation of the very members it targets).
      //
      // BUG (was): this only exempted owner + mod, not sudo — inconsistent
      // with every other privilege gate in this file (mode check a few
      // lines below already treats owner/mod/sudo as equally privileged).
      // A sudo user (sudo but not also a mod) had their messages run
      // through antiSystems.checkAll() like a regular member — if any
      // anti-system feature flagged/deleted their message (antilink,
      // antispam, etc.), the handler returned right here, before
      // mention-react (or anything else below) ever ran. That's why
      // mention-react could silently fail for sudo specifically.
      if (m.isGroup) {
        const isPrivileged =
          isOwner ||
          this.bot.permission.isMod(sender, m._participantRaw) ||
          this.bot.permission.isSudo(sender, m._participantRaw);
        if (!isPrivileged) {
          let blocked = false;
          try {
            blocked = await this.bot.antiSystems.checkAll(m);
          } catch (err) {
            blocked = false;
          }
          if (blocked) return;
        }
      }

      // ── BAN GATE — a banned user gets total silence ─────────────────────
      // Set with .ban / .unban (lib/banStore.js). Everything below is bot
      // behaviour aimed at the sender — commands, sticker commands, bare game
      // moves, the chatbot, auto-reply, reactions, notes — so dropping the
      // message here makes the bot completely silent to them: no reply, no
      // error, no reaction. Moderation (mute enforcement + anti-systems) ran
      // ABOVE this on purpose and still applies. The owner and mods can never
      // be locked out by it.
      if (!m.key.fromMe && !isOwner) {
        try {
          const _banCandidates = [
            sender,
            m.sender,
            m._participantRaw,
            m.key?.participant,
            m.key?.participantAlt,
            m.isGroup ? null : m.key?.remoteJid,
            m.isGroup ? null : m.key?.remoteJidAlt,
          ].filter(Boolean);
          if (
            require("./banStore").isBanned(_banCandidates) &&
            !this.bot.permission.isMod(sender, m._participantRaw)
          ) {
            return;
          }
        } catch {}
      }

      // ── .foldgc CONFIRM — a "yes" answering a pending .foldgc ───────────
      // .foldgc asks "reply yes to confirm" and waits (commands/group/foldgc.js).
      // The owner/mod's "yes" runs it right away; anyone else's "yes" is ignored.
      if (m.isGroup && this.bot._foldgcPending?.has(jid)) {
        try {
          const _fg = this.bot.commandHandler.getCommand("foldgc");
          if (_fg?.confirmIfPending && (await _fg.confirmIfPending(this.bot, m, text))) return;
        } catch (e) {
          console.error("[foldgc-confirm]", e.message);
        }
      }

      // ── MENTION-REACT — runs BEFORE the public/private mode gate ────────
      // Anyone tagging the owner, not just sudo/mod. Respond only to a
      // genuine owner tag, never a reply.
      //
      // BUG (was): this ran AFTER the mode check below. In "private" mode,
      // the mode check silently `return`s for anyone who isn't owner/mod/
      // sudo — before this block was ever reached. So in private mode,
      // mention-react could only ever fire for a mod/sudo tagging the
      // owner, because that was the only category of sender still alive by
      // the time execution got here. Everyone else's tag was invisible to
      // this code entirely — not rejected, just never seen. It looked like
      // "only sudo/mod trigger it" and like settings weren't sticking,
      // when really the config was fine and saved correctly — the block
      // just never ran for regular senders. Moved above the mode gate,
      // matching the same fix already applied to mute-enforcement and
      // anti-systems above: this is a passive reaction, not a command a
      // user is issuing, so private mode must not silence it.
      if (!m.fromMe && !m.key?.fromMe) {
        try {
          const mentionMod = require("../commands/owner/mention.js");
          const mentionCfg = mentionMod.mentionConfig;
          if (mentionCfg?.active) {
            const ownerNum = this.bot.permission._phone(
              this.bot.config.owner.number,
            );
            const rawMsg = msg.message || {};
            const ctxInfo =
              rawMsg.extendedTextMessage?.contextInfo ||
              rawMsg.imageMessage?.contextInfo ||
              rawMsg.videoMessage?.contextInfo ||
              {};
            const allMentions = [
              ...(ctxInfo.mentionedJid || []),
              ...(rawMsg.conversation?.match(/@\d+/g) || []).map((tag) =>
                `${tag.slice(1)}@s.whatsapp.net`,
              ),
              ...(m.mentions || []),
              ...(m.msg?.contextInfo?.mentionedJid || []),
            ];
            const ownerJid = ownerNum + "@s.whatsapp.net";
            // Resolve the owner's LID once. mentionedJid / contextInfo.participant
            // are now LIDs (e.g. 2235...@lid) whose digits do NOT match the owner's
            // phone, so digit tail-matching alone always misses. We map owner PN→LID
            // and also LID-match. lidMapping methods are async and may return null
            // if Baileys hasn't stored the mapping yet — _matchOwner stays as the
            // PN-form fallback. (?. guards keep this a no-op on pre-v7 Baileys.)
            const _normLid = (j) =>
              (j || "")
                .replace(/:[0-9]+@/, "@")
                .toLowerCase()
                .trim();
            let _ownerLid = "";
            try {
              _ownerLid =
                (await this.bot.sock.signalRepository?.lidMapping?.getLIDForPN(
                  ownerJid,
                )) || "";
            } catch {}
            // REPLY-ONLY: trigger only on a genuine @mention of the owner
            // OR a direct reply to one of the owner's messages — never on
            // plain text that merely contains the owner's number.
            const _matchOwner = (j) => {
              if (!j) return false;
              if (_ownerLid && _normLid(j) === _normLid(_ownerLid)) return true;
              const phone = j
                .replace(/:[0-9]+@/, "@")
                .split("@")[0]
                .replace(/[^0-9]/g, "");
              return (
                phone &&
                (phone === ownerNum ||
                  phone.endsWith(ownerNum) ||
                  ownerNum.endsWith(phone))
              );
            };
            const isMentioned = allMentions.some(_matchOwner);
            const repliedParticipant =
              ctxInfo.participant || m.contextInfo?.participant || "";
            const isReplyToOwner = _matchOwner(repliedParticipant);
            // Trigger ONLY on a genuine @mention of the owner.
            // A reply to the owner's message auto-includes the owner in
            // mentionedJid, so we explicitly exclude reply-to-owner here —
            // the mention-react must NOT fire when someone merely replies to
            // the owner. Also never react to the owner's own messages.
            if (mentionCfg.active && isMentioned && !isReplyToOwner && !_matchOwner(sender)) {
              if (mentionCfg.action === "react" && mentionCfg.emoji) {
                await this.bot.sock
                  .sendMessage(jid, {
                    react: { text: mentionCfg.emoji, key: m.key },
                  })
                  .catch(() => {});
              } else if (mentionCfg.action === "sticker") {
                try {
                  const stickerBuf = await require("fs").promises.readFile(mentionMod.STICKER_FILE);
                  await this.bot.sock
                    .sendMessage(jid, { sticker: stickerBuf }, { quoted: msg })
                    .catch(() => {});
                } catch {}
              } else if (mentionCfg.action === "audio") {
                try {
                  const audioBuf = await require("fs").promises.readFile(mentionMod.AUDIO_FILE);
                  await this.bot.sock
                    .sendMessage(
                      jid,
                      {
                        audio: audioBuf,
                        mimetype: mentionCfg.audioMime || "audio/mpeg",
                        ptt: !!mentionCfg.audioPtt,
                      },
                      { quoted: msg },
                    )
                    .catch(() => {});
                } catch {}
              } else if (mentionCfg.action === "text" && mentionCfg.text) {
                await this.bot.sock
                  .sendMessage(jid, { text: mentionCfg.text }, { quoted: msg })
                  .catch(() => {});
              }
            }
          }
        } catch {}
      }

      // ── MODE CHECK ───────────────────────────────────────────────────────
      // public  → everyone can use the bot
      // private → only owner / mod / sudo can use it; everyone else is SILENT
      //           (no reaction, no reply — the bot acts as if it didn't see it)
      const _mode = (this.bot.config.mode || "public").toLowerCase();
      if (_mode === "private") {
        const allowed =
          isOwner ||
          this.bot.permission.isSudo(sender, m._participantRaw) ||
          this.bot.permission.isMod(sender, m._participantRaw);
        if (!allowed) {
          // .permit — a command the owner opened to everyone (global, all
          // groups + DMs) is let through. Owner/admin commands can never be
          // permitted (lib/permit.js re-checks that on every use).
          let _permitted = false;
          try { _permitted = require("./permit").isTextPermitted(this.bot, text); } catch {}
          if (!_permitted) {
            // The CODEX AI chatbot is open to EVERYONE in every mode (its own
            // modes dm / group / tag decide when it answers). Commands stay
            // locked, so everything else remains completely silent.
            if (!m.key.fromMe && !text.startsWith(this.bot.prefix)) {
              try {
                await require("./ai/chatbot").handle(
                  this.bot,
                  m,
                  text.trim(),
                  this._chatbotHelpers(),
                );
              } catch (e) {
                console.error("[CHATBOT-AI]", e.message);
              }
            }
            // Completely silent otherwise — no reaction, no message, no hint
            return;
          }
        }
      }

      // ── $ EVAL — always triggers with no prefix required ───────────────────
      // Requested explicitly: `$code` should invoke eval regardless of the
      // configured prefix or no-prefix mode — it doesn't need "." or
      // whatever prefix is set in front of it, just the bare $ itself.
      // Still owner-only: this bypasses the normal prefix parsing, not the
      // permission gate — arbitrary code execution must never be reachable
      // by anyone else, bypass or not.
      //
      // BUG (was): this check used to sit AFTER the CODEX AI chatbot block
      // below, whose only guard is `!m.key.fromMe` (not isOwner). Baileys
      // doesn't always mark a message fromMe=true for the owner (e.g. sent
      // from a second linked device, or various @lid edge cases) — isOwner
      // is what correctly recognizes the owner in those cases, via a digit
      // tail-match, further below. Whenever fromMe happened to be false for
      // a bare `$code` message, the chatbot block ran FIRST, swallowed it
      // as ordinary AI chat, and returned before this bypass was ever
      // reached — while `.$ code` never had that problem, since the
      // chatbot block's `!text.startsWith(prefix)` guard always skips it
      // for a prefixed message regardless of fromMe. That's why bare `$`
      // could stop working while `.$` kept working fine. Moved up here,
      // before every ambient text handler (auto-reply, chatbot, setemoji,
      // word chain), so a bare `$` is always caught first, exactly as the
      // comment above always intended.
      if (text.trim().startsWith('$')) {
        const _evalCmd = this.bot.commandHandler.getCommand('$');
        // Owner AND mods may run eval (mods have full access to owner-only commands).
        if (_evalCmd && (isOwner || m.key.fromMe || this.bot.permission.isMod(sender, m._participantRaw))) {
          const _evalArgs = text.trim().slice(1).trim().split(/ +/).filter(Boolean);
          try {
            await this._run(_evalCmd, m, _evalArgs, '$');
          } catch (err) {
            console.error("Command error:", err);
            this._reportErrorToOwner(err, m, '$', _evalArgs).catch(() => {});
            await m.reply(`Error: ${err.message}`);
          }
          return;
        }
        if (_evalCmd) return; // looked like eval syntax but sender isn't the owner/mod — stay silent
      }

      // NOTE: typing @all / @everyone does NOT tag anyone any more — tagging everyone
      // only happens through the commands (.tagall, .all, .everyone).

      // ── AUTO REPLY ────────────────────────────────────────────────────
      if (!m.key.fromMe && (!text || !text.startsWith(this.bot.prefix))) {
        await this._handleAutoReply(m, text || "");
      }

      // ── AUTO REACT ────────────────────────────────────────────────────
      const arCfg = this.bot.config.autoReact;
      if (arCfg?.enabled && !m.key.fromMe) {
        await this.bot.sock
          .sendMessage(jid, {
            react: { text: arCfg.emoji || "❤️", key: m.key },
          })
          .catch(() => {});
      }

      // ── AUTOREACT — random emoji pool (CRYSNOVA style) ───────────────
      try {
        const arCfg = this.bot.config.autoReact;
        if (arCfg?.enabled && !m.key.fromMe && text) {
          let emoji = arCfg.emoji || "❤️";
          try {
            const fs = require("fs-extra");
            const arDb = JSON.parse(
              fs.readFileSync("./database/autoreact.json", "utf8"),
            );
            if (arDb.enabled && arDb.emojis?.length) {
              emoji =
                arDb.emojis[Math.floor(Math.random() * arDb.emojis.length)];
            }
          } catch {}
          await this.bot.sock
            .sendMessage(jid, { react: { text: emoji, key: m.key } })
            .catch(() => {});
        }
      } catch {}

      // ── STICKER CMD ───────────────────────────────────────────────────
      if (m.type === "stickerMessage" && m.msg?.fileSha256) {
        // Only stop here if the sticker really is a bound command/note —
        // otherwise let it continue so the chatbot can see it.
        if (await this._handleStickerCommand(m)) return;
      }

      // NOTE: DND is now handled by lib/antiSystems.js as a first-class
      // anti-system (runs inside antiSystems.checkAll(), called earlier in
      // this same handle()) — it uses _doAction() for delete/kick/warn
      // instead of a hardcoded delete+reply, is per-group instead of
      // global, and supports the timers/schedule engine (.dnd 5h,
      // .sch -dnd 12am to 6pm daily). The inline version that used to live
      // here has been removed to avoid running two DND checks on every
      // message.
      // ── SETEMOJI TRIGGER ──────────────   ──────────────────────────────
      try {
        if (!text.startsWith(this.bot.prefix) && text.trim()) {
          const _seFs = require("fs-extra");
          const _sePath = "./database/setemoji.json";
          const _seDb = _seFs.existsSync(_sePath)
            ? JSON.parse(_seFs.readFileSync(_sePath, "utf8"))
            : {};
          const _emoji = text.trim();
          if (_seDb[_emoji]) {
            const _eParts = _seDb[_emoji].trim().split(/\s+/);
            const _eCmd = this.bot.commandHandler.getCommand(
              _eParts[0].toLowerCase(),
            );
            if (_eCmd) {
              await this._run(
                _eCmd,
                m,
                _eParts.slice(1),
                _eParts[0].toLowerCase(),
              );
              return;
            }
          }
        }
      } catch {}

      // ── WORD CHAIN BARE INPUT ─────────────────────────────────────────
      // Handle Word Chain's exact bare triggers and active-turn words before
      // chatbot processing can consume them as ordinary conversation.
      {
        const _replyText = (() => {
          const _quoted = m?.quoted?.message || m?.msg?.contextInfo?.quotedMessage || m?.message?.extendedTextMessage?.contextInfo?.quotedMessage || {};
          const _candidates = [
            _quoted?.conversation,
            _quoted?.text,
            _quoted?.caption,
            _quoted?.extendedTextMessage?.conversation,
            _quoted?.extendedTextMessage?.text,
            _quoted?.imageMessage?.caption,
            _quoted?.videoMessage?.caption,
            _quoted?.documentMessage?.caption,
          ];
          const _picked = _candidates.find(value => typeof value === 'string' && value.trim());
          return String(_picked || '').trim();
        })();
        const _wordchainText = text.trim() || _replyText;
        const _wordchainFirst = _wordchainText.split(/ +/)[0]?.toLowerCase();
        const _wordchainCommand = this.bot.commandHandler.getCommand('wordchain');
        const _wordchainBareTrigger = _wordchainCommand && _wordchainText && !_wordchainText.includes(' ') &&
          Array.isArray(_wordchainCommand.bareTriggers) &&
          _wordchainCommand.bareTriggers.some(trigger => String(trigger).toLowerCase() === _wordchainFirst) &&
          typeof _wordchainCommand.shouldHandleBare === 'function' &&
          _wordchainCommand.shouldHandleBare(m);
        const _wordchainBareMove = _wordchainCommand && _wordchainText && !_wordchainText.includes(' ') &&
          _wordchainCommand.acceptsBareInput === true &&
          typeof _wordchainCommand.shouldHandleBare === 'function' &&
          _wordchainCommand.shouldHandleBare(m);

        if ((_wordchainBareTrigger || _wordchainBareMove) && m.isGroup) {
          try {
            const bareArgs = _wordchainBareMove ? [_wordchainText.toLowerCase()] : [];
            await this._run(_wordchainCommand, m, bareArgs, _wordchainBareMove ? 'wordchain' : _wordchainFirst);
          } catch (err) {
            console.error("Command error:", err);
            this._reportErrorToOwner(err, m, 'wordchain', [_wordchainText]).catch(() => {});
            await m.reply(`Error: ${err.message}`);
          }
          return;
        }
      }

      // ── CODEX AI chatbot (lib/ai/chatbot.js) ───────────────────────────
      // Runs only on non-command messages, never for the bot's own outgoing
      // messages. Text, voice notes and media (image/sticker/video) are all
      // handed to the chatbot, which decides (modes: dm / group / tag) whether
      // to answer. Placed AFTER setemoji so an explicit emoji binding wins.
      const _isChatbotMediaType = [
        "stickerMessage",
        "imageMessage",
        "videoMessage",
        "audioMessage",
      ].includes(m.type);
      if (
        !m.key.fromMe &&
        (text.trim() || _isChatbotMediaType) &&
        !text.startsWith(this.bot.prefix)
      ) {
        try {
          const handled = await require("./ai/chatbot").handle(
            this.bot,
            m,
            text.trim(),
            this._chatbotHelpers(),
          );
          if (handled) return;
        } catch (e) {
          console.error("[CHATBOT-AI]", e.message);
        }
      }

      // ── #notename shorthand ───────────────────────────────────────────
      if (text.startsWith("#") && text.length > 1) {
        const name = text.slice(1).trim().toLowerCase();
        let db = {};
        try {
          db = JSON.parse(fs.readFileSync("./database/notes.json", "utf8"));
        } catch {}
        const note = db[jid]?.[name];
        if (note) {
          await this.bot.sendMessage(jid, {
            text: `📌 *${name.toUpperCase()}*\n\n${note.text}`,
          });
          return;
        }
      }


      // ── PER-COMMAND NO-PREFIX FLAG (command.noPrefix === true) ────────────
      // A command can opt itself out of prefix matching entirely by setting
      // `noPrefix: true` in its module.exports. Such a command triggers ONLY
      // on its bare name/alias with no prefix in front — it does NOT also
      // respond to "<prefix>name" (that lookup is excluded further below).
      // Checked ahead of the normal prefix flow so it works regardless of
      // whether a prefix is configured or the bot is in global no-prefix mode.
      {
        const _npParts = text.trim().split(/ +/);
        const _npFirst = (_npParts[0] || '').toLowerCase();
        const _npCmd = _npFirst ? this.bot.commandHandler.getCommand(_npFirst) : null;

        if (_npCmd && _npCmd.noPrefix === true) {
          const _npArgs = _npParts.slice(1);

          const isMod = this.bot.permission.isMod(sender, m._participantRaw);
          const isSudo = this.bot.permission.isSudo(sender, m._participantRaw);
          const isAdmin = m.isGroup
            ? await this.bot.permission.isAdmin(jid, sender, m._participantRaw)
            : false;

          if (_npCmd.groupOnly && !m.isGroup) {
            return await m.reply("This command only works in groups!");
          }
          if (_npCmd.ownerOnly && !isOwner && !isMod) {
            return await m.reply("Owner only command");
          }
          if (_npCmd.sudoOnly && !isOwner && !isMod && !isSudo) {
            return await m.reply("Owner or sudo only command");
          }
          if (_npCmd.adminOnly && !isAdmin) {
            return await m.reply("Admin only command!");
          }

          try {
            await this._run(_npCmd, m, _npArgs, _npFirst);
          } catch (err) {
            console.error("Command error:", err);
            this._reportErrorToOwner(err, m, _npFirst, _npArgs).catch(() => {});
            await m.reply(`Error: ${err.message}`);
          }
          return;
        }
      }

      // Some commands may opt into a narrowly-scoped bare phrase without
      // disabling their normal prefixed command names. This is intentionally
      // exact-match based so ordinary conversation is not routed to commands.
      {
        const _bareParts = text.trim().split(/ +/);
        const _bareFirst = (_bareParts[0] || '').toLowerCase();
        const _bareCommand = _bareFirst
          ? [...this.bot.commands.values()].find(command =>
              Array.isArray(command.bareTriggers) &&
              command.bareTriggers.some(trigger => String(trigger).toLowerCase() === _bareFirst) &&
              (typeof command.shouldHandleBare !== 'function' || command.shouldHandleBare(m)))
          : null;

        if (_bareCommand && _bareParts.length === 1) {
          if (_bareCommand.groupOnly && !m.isGroup) return;
          try {
            await this._run(_bareCommand, m, [], _bareFirst);
          } catch (err) {
            console.error("Command error:", err);
            this._reportErrorToOwner(err, m, _bareFirst, []).catch(() => {});
            await m.reply(`Error: ${err.message}`);
          }
          return;
        }
      }

      // A live game may opt into receiving a bare single-word move. The
      // command decides whether the current chat and sender are eligible,
      // keeping ordinary one-word conversation outside command dispatch.
      {
        const _bareInput = text.trim();
        const _bareInputCommand = _bareInput && !/\s/.test(_bareInput)
          ? [...this.bot.commands.values()].find(command =>
              command.acceptsBareInput === true &&
              typeof command.shouldHandleBare === 'function' &&
              command.shouldHandleBare(m))
          : null;

        if (_bareInputCommand) {
          try {
            await this._run(_bareInputCommand, m, [_bareInput.toLowerCase()], _bareInputCommand.name);
          } catch (err) {
            console.error("Command error:", err);
            this._reportErrorToOwner(err, m, _bareInputCommand.name, [_bareInput]).catch(() => {});
            await m.reply(`Error: ${err.message}`);
          }
          return;
        }
      }

      // ── PREFIX CHECK / NO-PREFIX MODE ─────────────────────────────────────
      // When bot.prefix is null, 'null', or '' (set via .setvar PREFIX=null),
      // the bot runs in no-prefix mode: the first word of any message is tried
      // as a command name. This allows .eval and other cmds without a prefix.
      const _rawPrefix = this.bot.config.prefix ?? this.bot.prefix ?? '.';
      const _isNoPrefix = !_rawPrefix || String(_rawPrefix).toLowerCase() === 'null';

      let _cmdText, commandName, args;

      if (_isNoPrefix) {
        // No-prefix: try to match the first word as a command
        const _parts = text.trim().split(/ +/);
        const _firstWord = (_parts[0] || '').toLowerCase();
        const _isPermitAlias = _firstWord === 'clear' && /^permits?$/i.test(_parts[1] || '');
        if (!_isPermitAlias && !this.bot.commandHandler.getCommand(_firstWord)) return; // not a command word
        args        = _parts.slice(1);
        commandName = _firstWord;
      } else {
        if (!text.startsWith(this.bot.prefix)) return;
        _cmdText    = text.slice(this.bot.prefix.length).trim();
        args        = _cmdText.split(/ +/);
        commandName = args.shift().toLowerCase();
      }

      // `.list permit` / `.clear permit` are shortcuts for `.permit list` / `.permit clear`
      // (owner/mod only — anyone else keeps the normal `.list` behaviour).
      if ((commandName === 'list' || commandName === 'clear') && /^permits?$/i.test(args[0] || '')) {
        if (isOwner || m.key?.fromMe || this.bot.permission.isMod(sender, m._participantRaw)) {
          args = [commandName, ...args.slice(1)];
          commandName = 'permit';
        }
      }

      // `.list ban` is a shortcut for `.ban list` (owner/mod only — anyone else keeps the normal `.list`).
      if (commandName === 'list' && /^bans?$/i.test(args[0] || '')) {
        if (isOwner || m.key?.fromMe || this.bot.permission.isMod(sender, m._participantRaw)) {
          args = ['list'];
          commandName = 'ban';
        }
      }

      const command = this.bot.commandHandler.getCommand(commandName);

      // A command flagged noPrefix:true was already handled (or rejected on
      // permissions) in the block above when typed bare. If it's reached
      // here it means someone typed "<prefix>name" instead — per spec that
      // must NOT trigger it, so treat it the same as an unknown command.
      if (!command || command.noPrefix === true) return;

      const isMod = this.bot.permission.isMod(sender, m._participantRaw);
      const isSudo = this.bot.permission.isSudo(sender, m._participantRaw);
      const isAdmin = m.isGroup
        ? await this.bot.permission.isAdmin(jid, sender, m._participantRaw)
        : false;

      if (command.groupOnly && !m.isGroup) {
        return await m.reply("This command only works in groups!");
      }
      // Owner-only gate: OWNER and MOD may use owner-only commands.
      // Mods have full access to every command, including owner-only ones.
      // Sudo does NOT bypass this — sudo can use everything EXCEPT owner-only.
      if (command.ownerOnly && !isOwner && !isMod) {
        return await m.reply("Owner only command");
      }
      // Sudo-only gate: owner, mod, or sudo may use it.
      if (command.sudoOnly && !isOwner && !isMod && !isSudo) {
        return await m.reply("Owner or sudo only command");
      }
      if (command.adminOnly && !isAdmin) {
        return await m.reply("Admin only command!");
      }

      try {
        await this._run(command, m, args, commandName);
      } catch (err) {
        console.error("Command error:", err);
        this._reportErrorToOwner(err, m, commandName, args).catch(() => {});
        await m.reply(`Error: ${err.message}`);
      }
    } catch (err) {
      console.error("Message handler error:", err);
    }
  }

  /**
   * Returns a Set of every digit-string identifier WhatsApp might use to refer
   * to this bot inside a specific group (phone JID, @lid, etc). Mention/reply
   * detection by comparing a single ID form is fragile under WhatsApp's @lid
   * rollout (same root issue as the isAdmin bug) — this cross-references the
   * group's own participant list (like isAdmin/isBotAdmin do) to learn every
   * alias the group itself knows for the bot, then caches it for 10 minutes.
   */
  async _getBotIdentityCandidates(jid) {
    this._botIdCache = this._botIdCache || new Map();
    const cached = this._botIdCache.get(jid);
    if (cached && Date.now() < cached.expires) return cached.candidates;

    const _digits = (j) =>
      (j || "")
        .replace(/:[0-9]+@/, "@")
        .split("@")[0]
        .replace(/[^0-9]/g, "");
    const candidates = new Set();
    [this.bot.sock.user?.id, this.bot.sock.user?.lid].forEach((j) => {
      const d = _digits(j);
      if (d) candidates.add(d);
    });

    try {
      const meta = await require("./groupMetaCache").get(this.bot, jid);
      const me = meta.participants.find((p) => {
        const cands = [p.id, p.lid, p.jid, p.phoneNumber]
          .map(_digits)
          .filter(Boolean);
        return cands.some((c) => candidates.has(c));
      });
      if (me) {
        [me.id, me.lid, me.jid, me.phoneNumber].forEach((j) => {
          const d = _digits(j);
          if (d) candidates.add(d);
        });
      }
    } catch (e) {
      /* groupMetadata can fail transiently — fall back to what we have */
    }

    this._botIdCache.set(jid, {
      candidates,
      expires: Date.now() + 10 * 60 * 1000,
    });
    // Bound the cache size — expiry alone caps how long a stale entry can
    // live, but not how many distinct group JIDs can accumulate before
    // expiring (a bot active in thousands of groups could otherwise grow
    // this indefinitely between sweeps). If it ever grows past a generous
    // ceiling, drop the oldest entries first.
    const MAX_BOT_ID_CACHE = 1000;
    if (this._botIdCache.size > MAX_BOT_ID_CACHE) {
      const entries = [...this._botIdCache.entries()].sort((a, b) => a[1].expires - b[1].expires);
      const toRemove = entries.slice(0, entries.length - MAX_BOT_ID_CACHE);
      for (const [key] of toRemove) this._botIdCache.delete(key);
    }
    return candidates;
  }

  /** Small bridge handed to lib/ai/chatbot.js (bot identity + group name lookups). */
  _chatbotHelpers() {
    return {
      botIdentity: (jid) => this._getBotIdentityCandidates(jid),
      groupName: async (jid) => {
        const meta = await require("./groupMetaCache").get(this.bot, jid);
        return meta?.subject || null;
      },
    };
  }

  async _handleAutoReply(m, text) {
    try {
      let db = {};
      try {
        db = JSON.parse(fs.readFileSync("./database/autoreply.json", "utf8"));
      } catch {}

      // ── Tag trigger: runs ALWAYS even if autoreply is off ────────────
      // If AREPLY_NUMBER is set and that number gets tagged → send reply
      const areplyNum = this.bot.config.AREPLY_NUMBER;
      if (areplyNum && (m.mentions || []).length > 0) {
        const cleanNum = areplyNum.replace(/[^0-9]/g, "");
        const cleanTarget = cleanNum + "@s.whatsapp.net";
        // Match mentions regardless of device suffix (:12@, etc.)
        const tagged = (m.mentions || []).some((jid) => {
          const stripped = jid.replace(/:[0-9]+@/, "@");
          return (
            stripped === cleanTarget || stripped.startsWith(cleanNum + "@")
          );
        });
        if (tagged) {
          // Use AREPLY_MSG if set, otherwise fall back to first rule's reply
          let replyText =
            this.bot.config.AREPLY_MSG ||
            (db.rules?.length ? db.rules[0].reply : null);
          if (!replyText) return; // No message configured
          if (db.mode === "emoji") {
            const pool = db.emojis?.length
              ? db.emojis
              : ["😊", "👍", "🔥", "❤", "✨"];
            replyText += " " + pool[Math.floor(Math.random() * pool.length)];
          }
          await this.bot.sendMessage(
            m.chat,
            { text: replyText, mentions: [cleanTarget] },
            { quoted: { key: m.key, message: m.message } },
          );
          return;
        }
      }

      // ── Keyword trigger: only runs if autoreply is enabled ────────────
      if (!db.enabled) return;
      const lower = text.toLowerCase();
      const match = db.rules.find((r) =>
        lower.includes(r.trigger.toLowerCase()),
      );
      if (!match) return;

      let replyText = match.reply;
      if (db.mode === "emoji") {
        const pool = db.emojis?.length
          ? db.emojis
          : ["😊", "👍", "🔥", "❤", "✨"];
        replyText += " " + pool[Math.floor(Math.random() * pool.length)];
      }

      await this.bot.sendMessage(
        m.chat,
        { text: replyText },
        { quoted: { key: m.key, message: m.message } },
      );
    } catch (err) {
      console.error("AutoReply error:", err.message);
    }
  }

  async _handleStatusMention(m) {
    try {
      const cfg = this.bot.config.antiGroupMention;
      if (!cfg?.enabled) return;
      const statusMentions = m.msg?.contextInfo?.mentionedJid || [];
      if (!statusMentions.length) return;
      const dbPath = "./database/antigroupmention.json";
      let db = {};
      try {
        db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
      } catch {}
      for (const jid of statusMentions) {
        if (jid.endsWith("@g.us") && db[jid]?.enabled) {
          const statusDbPath = "./database/statusmention.json";
          let statusDb = {};
          try {
            statusDb = JSON.parse(fs.readFileSync(statusDbPath, "utf8"));
          } catch {}
          if (!statusDb[jid]) statusDb[jid] = [];
          statusDb[jid].push({
            statusJid: m.key.remoteJid,
            sender: m.sender,
            time: Date.now(),
          });
          fs.writeFileSync(statusDbPath, JSON.stringify(statusDb, null, 2));
        }
      }
    } catch (err) {
      console.error("Status mention handler error:", err);
    }
  }

  async _handleStickerCommand(m) {
    try {
      // Support both hex (setcmd format) and base64
      const sha = m.msg.fileSha256;
      const raw = Buffer.isBuffer(sha) || sha instanceof Uint8Array
        ? Buffer.from(sha)
        : typeof sha === 'string'
          ? Buffer.from(sha, 'base64')
          : null;
      if (!raw?.length) return false;
      const idHex = raw.toString('hex');
      const idB64 = raw.toString('base64');
      let db = {};
      try {
        db = JSON.parse(fs.readFileSync(STICKER_COMMANDS_DB, "utf8"));
      } catch {}
      const entry = db[idHex] || db[idB64];
      if (!entry) return false;

      // Note type: show the note
      if (entry.type === "note") {
        let notesDb = {};
        try {
          notesDb = JSON.parse(
            fs.readFileSync("./database/notes.json", "utf8"),
          );
        } catch {}
        const chatId = entry.chat || m.chat;
        const note = notesDb[chatId]?.[entry.noteName];
        if (!note) {
          await this.bot.sendMessage(m.chat, {
            text: `Note "${entry.noteName}" no longer exists.`,
          });
          return true;
        }
        await this.bot.sendMessage(m.chat, {
          text: `${entry.noteName.toUpperCase()}\n\n${note.text}`,
        });
        return true;
      }

      // Command type
      const cmd = this.bot.commandHandler.getCommand(entry.command);
      if (!cmd) return false;
      await this._run(cmd, m, [], entry.command);
      return true;
    } catch (err) {
      console.error("Sticker cmd error:", err);
      return true;
    }
  }

  smsg(msg) {
    if (!msg.message) return null;
    let m = {};
    m.message = msg.message;
    m.key = msg.key;
    m.chat = msg.key.remoteJidAlt || msg.key.remoteJid;
    m.fromMe = msg.key.fromMe;
    m.id = msg.key.id;
    // Baileys (and most bot libraries) generate message IDs in a predictable
    // format: "3EB0" + 16 hex chars = 20 chars total, i.e. exactly 22 chars
    // once you include the "3EB0" prefix itself. The official WhatsApp app
    // never produces IDs shaped like this, so it's a reliable signal that a
    // message came from a bot/automation account rather than a real phone.
    m.isBot = m.id.startsWith("3EB0") && m.id.length === 22;
    m.isBaileys = m.isBot;
    m.isGroup = m.chat.endsWith("@g.us");

    // ── LID/JID sender resolution ──────────────────   ─────   ───────────────
    // fromMe=true always means the owner sent this message (from their phone).
    // Resolve sender directly to owner number in ALL cases (group or DM).
    // This ensures isOwner() returns true in both DM and group for owner commands.
    if (msg.key.fromMe) {
      m.sender = (
        this.bot.sock.user?.id ||
        msg.key.remoteJidAlt ||
        msg.key.remoteJid
      ).replace(/:[0-9]+@/, "@");
    } else if (m.isGroup) {
      m.sender = (
        msg.key.participantAlt ||
        msg.key.participant ||
        msg.key.remoteJidAlt ||
        msg.key.remoteJid
      ).replace(/:[0-9]+@/, "@");
    } else {
      m.sender = (msg.key.remoteJidAlt || msg.key.remoteJid || "").replace(
        /:[0-9]+@/,
        "@",
      );
    }

    m.pushName = msg.pushName || "";
    m._raw = msg; // raw Baileys message
    m._participantRaw = msg.key.participant || ""; // participant with device suffix intact

    const type = getContentType(msg.message);
    m.type = type;

    // Handle view-once messages (all variants)
    if (
      type === "viewOnceMessage" ||
      type === "viewOnceMessageV2" ||
      type === "viewOnceMessageV2Extension"
    ) {
      const innerMsg = msg.message[type]?.message || msg.message[type];
      const innerType = getContentType(innerMsg);
      m.msg = innerMsg?.[innerType];
      m.viewOnce = true;
      m.viewOnceType = innerType;
      m.viewOnceMsg = innerMsg;
      m.viewOnceRaw = msg;
    } else {
      m.msg = msg.message[type];
    }

    // Extract text — try all known locations to handle fromMe group messages
    m.text =
      typeof m.msg === "string"
        ? m.msg
        : m.msg?.text ||
          m.msg?.caption ||
          m.msg?.conversation ||
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          msg.message?.documentMessage?.caption ||
          "";

    // Pull contextInfo from every possible message type location
    const _rawMsg = msg.message || {};
    const _ctx =
      _rawMsg.extendedTextMessage?.contextInfo ||
      _rawMsg.imageMessage?.contextInfo ||
      _rawMsg.videoMessage?.contextInfo ||
      _rawMsg.documentMessage?.contextInfo ||
      _rawMsg.audioMessage?.contextInfo ||
      _rawMsg.stickerMessage?.contextInfo ||
      _rawMsg.buttonsMessage?.contextInfo ||
      (typeof m.msg === "object" ? m.msg?.contextInfo : null) ||
      {};
    m.mentions = _ctx.mentionedJid || [];
    m.contextInfo = _ctx;

    if (_ctx.quotedMessage && _ctx.stanzaId) {
      const quotedMessage = _ctx.quotedMessage;
      const quotedType = getContentType(quotedMessage);
      const quotedContent = quotedMessage[quotedType] || {};
      const quotedKey = {
        remoteJid: m.chat,
        id: _ctx.stanzaId,
        participant: _ctx.participant || m.chat,
        fromMe: false,
      };
      const quoted = {
        key: quotedKey,
        message: quotedMessage,
        msg: quotedContent,
        mtype: quotedType,
        type: quotedType.replace(/Message$/, '').toLowerCase(),
        mimetype: quotedContent.mimetype,
        fileName: quotedContent.fileName,
        caption: quotedContent.caption,
        text: quotedContent.conversation || quotedContent.text || quotedContent.caption || '',
        download: async () => {
          const mediaType = quotedType.replace(/Message$/, '').toLowerCase();
          const stream = await downloadContentFromMessage(quotedContent, mediaType);
          const chunks = [];
          for await (const chunk of stream) chunks.push(chunk);
          return Buffer.concat(chunks);
        },
      };
      m.quoted = quoted;
    }

    const bot = this.bot;

    // m.reply routes through bot.sendMessage so font + character/emoji all apply automatically
    m.reply = async (text, opts = {}) => {
      return await bot.sendMessage(m.chat, { text, ...opts }, { quoted: msg });
    };

    return m;
  }
}

module.exports = MessageHandler;
