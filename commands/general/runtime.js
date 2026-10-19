/**
 * .runtime — shows the bot's live runtime status (uptime, memory, PID, time, Node, platform).
 */
const os = require('os');

const tz = require('../../lib/timezone'); // bot timezone (.setvar TIME_ZONE=...)

// 2d 3h 10m 1s — units that are zero are left out (30d 10m 1s)
function fmtUptime(totalSeconds) {
    const t = Math.floor(totalSeconds);
    const parts = [
        [Math.floor(t / 86400), 'd'],
        [Math.floor((t % 86400) / 3600), 'h'],
        [Math.floor((t % 3600) / 60), 'm'],
        [t % 60, 's'],
    ].filter(([n]) => n > 0).map(([n, u]) => `${n}${u}`);
    return parts.length ? parts.join(' ') : '0s';
}

module.exports = {
    name: 'runtime',
    aliases: ['rt', 'status'],
    category: 'general',
    reactions: { start: '📊' },
    description: 'Show the bot runtime status — uptime, memory, process ID, time, Node version, platform',

    async execute(bot, m) {
        const uptime = fmtUptime(process.uptime());
        const memory = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        const time   = new Date().toLocaleString('en-US', { timeZone: tz.get() });

        return m.reply(
`*CODEX RUNTIME STATUS*

 _Uptime ➪_ \`\`\`${uptime}\`\`\`

 _Memory ➪_ \`\`\`${memory} MB\`\`\`

 _Process ID ➪_ \`\`\`${process.pid}\`\`\`

 _Time ➪_ \`\`\`${time}\`\`\`

 _Node ➪_ \`\`\`${process.version}\`\`\`

 _Platform ➪_ \`\`\`${os.platform()}\`\`\`

 _Bot is running perfectly!_`);
    },
};
