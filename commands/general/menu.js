const tz = require('../../lib/timezone');
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');
const os    = require('os');

const DEFAULT_THUMB = 'https://cdn.kord.live/serve/2ssBORnrHDAK.jpg';
const CACHED_IMG    = path.join(__dirname, '../../assets/menu.png');

module.exports = {
    name: 'menu',
    aliases: ['help', 'cmds', 'list'],
    category: 'general',
    reactions: { start: '⚙️' },
    description: 'Show all commands with CODEX UI',

    async execute(bot, m, args) {
        // `.list plugins` shows installed plugins specifically instead of
        // the full command menu — same data as .listplugins, just reachable
        // through the phrasing requested alongside the "list" alias.
        if ((args[0] || '').toLowerCase() === 'plugins') {
            const { listPlugins } = require('../../lib/pluginManager');
            const plugins = listPlugins(bot);
            if (!plugins.length) {
                return await m.reply(`📦 No plugin installed.\n\nUse ${bot.prefix}install <link> to add one.`);
            }
            const text = plugins
                .map((cmd, i) => `${i + 1}. ${bot.prefix}${cmd.name}${cmd.source ? `\n   ${cmd.source}` : ''}`)
                .join('\n');
            return await m.reply(`📦 *Installed Plugins* (${plugins.length})\n\n${text}`);
        }

        const c          = bot.config;
        const prefix     = bot.prefix || c.prefix || '.';
        const categories = bot.commandHandler.getAllCommands();

        const uniqueCount = bot.commandHandler.getCommandCount();

        // --- NEW UPTIME PATTERN LOGIC ---
        const up  = process.uptime();
        const d   = Math.floor(up / 86400);
        const h   = Math.floor((up % 86400) / 3600);
        const min = Math.floor((up % 3600) / 60);
        const s   = Math.floor(up % 60);

        const time = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true, timeZone: tz.get()
        }).toLowerCase();

        const getRam = () => {
            try {
                const total = os.totalmem();
                const used  = total - os.freemem();
                return `${(used/1024/1024/1024).toFixed(1)}/${(total/1024/1024/1024).toFixed(1)} GB (${Math.round(used/total*100)}%)`;
            } catch { return 'N/A'; }
        };

        const getHost = () => {
            const isPanelHost = [
                process.env.PTERODACTYL,
                process.env.PANEL,
                process.env.P_SERVER_UUID,
                process.env.P_SERVER_MEMORY,
                process.env.P_SERVER_PORT,
            ].find(Boolean);

            if (isPanelHost) return 'Pterodactyl (panel)';

            return process.env.HOSTNAME || os.hostname?.() || 'unknown-host';
        };

        const senderName = m.pushName || m.sender?.split('@')[0] || 'Unknown';
        const readmore   = String.fromCharCode(0x200E).repeat(4001);

        let text = '';
        text += `╔═══〔 𖣘 *${(c.settings?.title || c.botName || 'CODEX AI').toUpperCase()}* 𖣘 〕═══❒\n`;
        text += `║╭───────────────◆\n`;
        text += `║│ 𖣘 *USER:* ${senderName}\n`;
        text += `║│ 𖣘 *HOST:* ${getHost()}\n`;
        text += `║│ 𖣘 *PREFIX:* ${prefix}\n`;
        text += `║│ 𖣘 *CMDS:* ${uniqueCount}\n`;
        // Applied the d-h-m-s pattern here inside backticks
        text += `║│ 𖣘 *UPTIME:* \`${d}d-${h}h-${min}m-${s}s\`\n`;
        text += `║│ 𖣘 *MODE:* ${(c.mode || 'private').toUpperCase()}\n`;
        text += `║│ 𖣘 *STORAGE:* ${getRam()}\n`;
        text += `║│ 𖣘 *TIME:* ${time}\n`;
        text += `║│ 𖣘 *TIMEZONE:* ${tz.label()}\n`;
        text += `║╰───────────────◆\n`;
        text += `╚══════════════════❒\n\n`;
        text += `${readmore}\n`;

        for (const [category, commands] of Object.entries(categories)) {
            text += `╔═══〔 𖣘 *${category.toUpperCase()}* 𖣘 〕═══❒\n`;
            text += `║╭───────────────◆\n`;
            const seen = new Set();
            for (const cmd of commands) {
                if (!cmd?.name) continue;
                const n = cmd.name.toLowerCase();
                if (seen.has(n)) continue;
                seen.add(n);
                text += `║│ 𖣘 ${prefix}${cmd.name}\n`;
            }
            text += `║╰───────────────◆\n`;
            text += `╚══════════════════❒\n\n`;
        }

        text += `╔═══〔 𖣘 *DEVELOPER* 𖣘 〕═══❒\n`;
        text += `║╭───────────────◆\n`;
        text += `║│ ✰ 𝗖𝗢𝗗𝗘𝗫\n`;
        text += `║╰───────────────◆\n`;
        text += `╚══════════════════❒`;

        const getMenuImage = async () => {
            const menuUrl = c.MENU_IMAGE || null;
            if (menuUrl) {
                try {
                    const res = await axios.get(menuUrl, { responseType: 'arraybuffer', timeout: 15000 });
                    fs.mkdirSync(path.dirname(CACHED_IMG), { recursive: true });
                    fs.writeFileSync(CACHED_IMG, res.data);
                    return Buffer.from(res.data);
                } catch {}
            }
            if (fs.existsSync(CACHED_IMG)) return fs.readFileSync(CACHED_IMG);
            try {
                const fallbackUrl = c.thumbUrl || DEFAULT_THUMB;
                const res = await axios.get(fallbackUrl, { responseType: 'arraybuffer', timeout: 15000 });
                fs.mkdirSync(path.dirname(CACHED_IMG), { recursive: true });
                fs.writeFileSync(CACHED_IMG, res.data);
                return Buffer.from(res.data);
            } catch { return null; }
        };

        const imgBuffer = await getMenuImage();

        await bot.sock.sendMessage(
            m.chat,
            imgBuffer ? { image: imgBuffer, caption: text } : { text },
            { quoted: m }
        );
    }
};
