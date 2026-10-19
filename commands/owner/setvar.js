const fs   = require('fs-extra');
const path = require('path');
const tz   = require('../../lib/timezone');
// Anchored to the project root (not process.cwd()) so persistent data
// lands in the same place regardless of the directory the process was
// launched from. CODEX_PROJECT_ROOT is a test-only override; production
// never sets it.
const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..', '..');

const DB   = path.join(PROJECT_ROOT, 'database/variables.json');

const readVars  = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return {}; } };
const saveVars  = (d) => { fs.ensureDirSync(path.dirname(DB)); fs.writeFileSync(DB, JSON.stringify(d, null, 2)); };

module.exports = {
    name:      'setvar',
    alias:     ['sv', 'setbotname', 'setname'],
    category: 'owner',
    desc:      'Set a bot config variable (BOT_NAME, PREFIX, MODE, etc.)',
    ownerOnly: true,
    reactions: { start: '🔐' },

    execute: async (bot, m, args) => {
        if (!args[0]) return await m.reply(
            `Usage: ${bot.prefix}setvar KEY=value\n\nExamples:\n` +
            `• ${bot.prefix}setvar BOT_NAME=CODEX AI\n` +
            `• ${bot.prefix}setvar PREFIX=.\n` +
            `• ${bot.prefix}setvar MODE=public\n` +
            `• ${bot.prefix}setvar MENU_IMAGE=https://example.com/menu.jpg\n` +
            `• ${bot.prefix}setvar TIME_ZONE=Africa/Lagos\n` +
            `• ${bot.prefix}setvar OWNER=2349064626405`
        );

        const full = args.join(' ');
        let key, value;
        if (full.includes('=')) {
            const idx = full.indexOf('=');
            key   = full.slice(0, idx).trim().toUpperCase();
            value = full.slice(idx + 1).trim();
        } else {
            key   = args[0].toUpperCase();
            value = args.slice(1).join(' ').trim();
        }

        if (!key || value === '') return await m.reply('Usage: `.setvar KEY=value`');

        // TIME_ZONE drives every schedule, cron job, timer-of-day and displayed
        // time (see lib/timezone.js). Validate first; store the canonical name
        // ("africa/lagos" -> "Africa/Lagos") and apply it live.
        if (key === 'TIMEZONE' || key === 'TZ') key = 'TIME_ZONE';
        if (key === 'TIME_ZONE') {
            const zone = tz.set(value);
            if (!zone) return await m.reply(
                `✘ *${value}* is not a valid timezone.\n\nUse a name like:\n` +
                `• ${bot.prefix}setvar TIME_ZONE=Africa/Lagos\n• ${bot.prefix}setvar TIME_ZONE=Europe/London\n• ${bot.prefix}setvar TIME_ZONE=America/New_York\n• ${bot.prefix}setvar TIME_ZONE=Asia/Dubai`);
            value = zone;
        }

        // Save to database/variables.json (persistent)
        const vars = readVars();
        vars[key]  = value;
        saveVars(vars);

        // Apply to live config immediately
        try {
            const cfg = bot.config;  // Use live bot.config directly — no require needed
            const keyMap = {
                BOT_NAME:     'settings.title',
                PREFIX:       'prefix',
                MODE:         'mode',
                OWNER:        'owner',
                BOT_FONT:     'BOT_FONT',
                BOT_CHARACTER:'BOT_CHARACTER',
                AI_BADGE:     'AI_BADGE',
                STATUS_EMOJI:'statusReact.emoji',
                MENU_IMAGE:   'MENU_IMAGE',
            };
            if (keyMap[key]) {
                const parts = keyMap[key].split('.');
                let obj = cfg;
                for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]] = obj[parts[i]] || {};
                obj[parts[parts.length - 1]] = value;
            }
            if (key === 'AUTOREPLY') {
                bot.config.AUTOREPLY = value;
                try {
                    const fs = require('fs-extra');
                    const dbPath = './database/autoreply.json';
                    const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : {};
                    const triggers = [
                        ...new Set(String(value).split(/[|,\n]+/).map((v) => String(v).trim()).filter(Boolean)),
                    ];
                    db.trigger = triggers[0] || '';
                    db.triggers = triggers;
                    db.enabled = db.enabled !== false;
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                } catch {}
            }
            if (key === 'AUTOREPLY_MSG') {
                bot.config.AUTOREPLY_MSG = value;
                try {
                    const fs = require('fs-extra');
                    const dbPath = './database/autoreply.json';
                    const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : {};
                    db.message = value;
                    db.type = 'text';
                    if (!db.enabled && (bot.config.AUTOREPLY || db.trigger || db.triggers?.length)) {
                        db.enabled = true;
                    }
                    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
                } catch {}
            }
            if (key === 'AUTOREPLY_TYPE') bot.config.AUTOREPLY_TYPE = value;
            if (key === 'AUTOREPLY_STICKER') bot.config.AUTOREPLY_STICKER = value;
            // Apply PREFIX live so commands work without restart
            if (key === 'PREFIX') {
                bot.config.prefix = value;
                try { bot.prefix = value; } catch {}
            }
            if (key === 'MODE') bot.config.mode = value;
            if (key === 'BOT_NAME') {
                if (!bot.config.settings) bot.config.settings = {};
                bot.config.settings.title = value;
                bot.config.botName = value;
            }
        } catch {}

        if (key === 'TIME_ZONE') {
            const now = new Date().toLocaleString('en-US', { timeZone: value, dateStyle: 'medium', timeStyle: 'medium' });
            return await m.reply(`✪ *TIME_ZONE* = ${tz.label(value)}\n\n_Time now: ${now}_\n_Schedules, cron jobs and every time the bot shows now use this zone. Saved._`);
        }

        return await m.reply(` *${key}* = ${value}\n\n_configuration updated ✓._`);
    }
};
