const { loadConfig, saveConfig, defaultConfig, toJid, normalizeJid, findLidForPhone } = require('../../lib/anticallManager');

module.exports = {
  name: 'anticall',
  aliases: ['ac', 'callblock'],
  description: 'Manage the full anti-call manager',
  owner: true,
  ownerOnly: true,
  async execute(bot, m, args) {
    const reply = (text) => m.reply(text);
    const prefix = bot.prefix || '.';
    const config = loadConfig();
    const sub = String(args[0] || '').toLowerCase();
    if (!sub) return reply(`📵 Anti-call manager\n\n${prefix}anticall on/off\n${prefix}anticall block on/off\n${prefix}anticall reason <text>\n${prefix}anticall unknownreason <text>\n${prefix}anticall schedule once <start ISO> <end ISO>\n${prefix}anticall schedule always <start HH:MM> <end HH:MM> [days] [dates] [months]\n${prefix}anticall schedule off\n${prefix}anticall reject add/remove/list <number or JID>\n${prefix}anticall whitelist add/remove/list <number or JID>\n${prefix}anticall status\n${prefix}anticall reset`);
    if (sub === 'on' || sub === 'off') { config.enabled = sub === 'on'; saveConfig(config); return reply(sub === 'on' ? '📵 Anti-call: ON — incoming calls are rejected (whitelisted numbers can still call).' : '📵 Anti-call: OFF — calls ring normally. (Numbers on the reject list are still blocked; clear them with the reject remove option.)'); }
    if (sub === 'block') {
      const state = String(args[1] || '').toLowerCase();
      if (state !== 'on' && state !== 'off') return reply(`Use ${prefix}anticall block on, or ${prefix}anticall block off.`);
      config.mode = state === 'on' ? 'block' : 'reject';
      saveConfig(config);
      return reply(state === 'on'
        ? '📵 Anti-call block: ON — callers will now get the anti-call message AND be blocked.'
        : '📵 Anti-call block: OFF — callers will just get the anti-call message and have their call rejected.');
    }
    if (sub === 'reason' || sub === 'unknownreason') { const text = args.slice(1).join(' ').trim(); if (!text) return reply('Provide a message.'); config[sub === 'reason' ? 'reason' : 'unknownReason'] = text; saveConfig(config); return reply('Anti-call message updated.'); }
    if (sub === 'schedule') {
      const action = String(args[1] || '').toLowerCase();
      if (action === 'off') { config.schedule.enabled = false; saveConfig(config); return reply('Anti-call schedule disabled.'); }
      if (action !== 'once' && action !== 'always') return reply('Use schedule once, always, or off.');
      if (!args[2] || !args[3]) return reply('Provide start and end values.');
      config.schedule = { ...config.schedule, enabled: true, type: action, start: args[2], end: args[3], days: args[4] ? args[4].split(',').map(Number) : [], dates: args[5] ? args[5].split(',').map(Number) : [], months: args[6] ? args[6].split(',').map(Number) : [] };
      saveConfig(config); return reply('Anti-call schedule updated.');
    }
    if (sub === 'reject' || sub === 'whitelist') {
      const listName = sub === 'reject' ? 'blacklist' : 'whitelist'; const action = String(args[1] || '').toLowerCase(); const target = args.slice(2).join(' ').trim();
      if (action === 'list' || !action) return reply(`${sub === 'reject' ? 'Blacklist' : 'Whitelist'}:\n${config[listName].length ? config[listName].join('\n') : '(empty)'}`);
      const jid = toJid(target); if (!jid) return reply('Provide a number or JID.');
      if (action === 'add' && !config[listName].some(item => normalizeJid(item) === normalizeJid(jid))) config[listName].push(jid);
      if (action === 'remove') config[listName] = config[listName].filter(item => normalizeJid(item) !== normalizeJid(jid));
      if (/^\d+$/.test(target) && sub === 'reject' && action === 'add' && !findLidForPhone(target)) config.pendingPhoneReject.push(target);
      saveConfig(config); return reply(`${sub} list updated.`);
    }
    if (sub === 'status') return reply(`Anti-call: ${config.enabled ? 'ON' : 'OFF'}\nBlock mode: ${config.mode === 'block' ? 'ON' : 'OFF'}\nWhitelist: ${config.whitelist.length}\nBlacklist: ${config.blacklist.length}\nPending LID: ${config.pendingPhoneReject.length}\nSchedule: ${config.schedule.enabled ? `ON (${config.schedule.type} ${config.schedule.start} - ${config.schedule.end}, ${require('../../lib/timezone').get()})` : 'OFF'}`);
    if (sub === 'reset') { saveConfig(defaultConfig); return reply('Anti-call reset to defaults.'); }
    return reply('Unknown anti-call option. Use the command without arguments for help.');
  },
};
