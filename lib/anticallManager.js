const fs = require('fs');
const path = require('path');
// Anchored to the project root (not process.cwd()) so persistent data
// lands in the same place regardless of the directory the process was
// launched from.
// CODEX_PROJECT_ROOT lets tests (and only tests) redirect persistent
// storage to a throwaway directory; production never sets it, so this
// always resolves to the real install directory there.
const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');


const CONFIG_PATH = path.join(PROJECT_ROOT, 'database', 'anticall.json');
const defaultConfig = {
  enabled: false,
  // 'reject'  -> caller just gets the call rejected + the anticall message
  // 'block'   -> caller gets rejected + the anticall message + blocked outright
  mode: 'reject',
  reason: '📵 Calls are not permitted.',
  unknownReason: '📵 Unknown numbers cannot call this account.',
  schedule: { enabled: false, type: 'always', start: '22:00', end: '06:00', days: [], dates: [], months: [] },
  blacklist: [],
  whitelist: [],
  pendingPhoneReject: [],
};

function cloneDefaults() { return JSON.parse(JSON.stringify(defaultConfig)); }
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) return mergeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')));
  } catch (_) {}
  return cloneDefaults();
}
function mergeConfig(value = {}) {
  const base = cloneDefaults();
  return { ...base, ...value, schedule: { ...base.schedule, ...(value.schedule || {}) }, blacklist: Array.isArray(value.blacklist) ? value.blacklist : [], whitelist: Array.isArray(value.whitelist) ? value.whitelist : [], pendingPhoneReject: Array.isArray(value.pendingPhoneReject) ? value.pendingPhoneReject : [] };
}
function saveConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(mergeConfig(config), null, 2));
}
function normalizeJid(jid) { return String(jid || '').trim().toLowerCase().replace(/:\d+(@|$)/, '$1'); }
function isInList(jid, list) { const value = normalizeJid(jid); return list.some(item => normalizeJid(item) === value); }
function isInBlacklist(jid, list) { return isInList(jid, list); }
function isInWhitelist(jid, list) { return isInList(jid, list); }
// Schedule times, days, dates and months are Nigeria time (Africa/Lagos) — the
// same clock the anti-call message shows — whatever timezone the host runs in.
function lagosNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
    year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { minutes: Number(get('hour')) * 60 + Number(get('minute')), day: days[get('weekday')], date: Number(get('day')), month: Number(get('month')) - 1 };
}
function isWithinSchedule(schedule, date = new Date()) {
  if (!schedule?.enabled) return true;
  if (schedule.type === 'once') return date >= new Date(schedule.start) && date <= new Date(schedule.end);
  const [sh, sm] = String(schedule.start || '00:00').split(':').map(Number);
  const [eh, em] = String(schedule.end || '23:59').split(':').map(Number);
  const now = lagosNow(date);
  const start = sh * 60 + sm; const end = eh * 60 + em;
  const inTime = end >= start ? now.minutes >= start && now.minutes <= end : now.minutes >= start || now.minutes <= end;
  return inTime && (!schedule.days?.length || schedule.days.includes(now.day)) && (!schedule.dates?.length || schedule.dates.includes(now.date)) && (!schedule.months?.length || schedule.months.includes(now.month));
}
function findLidForPhone(phone) {
  try {
    const dir = path.join(PROJECT_ROOT, 'sessions');
    for (const file of fs.readdirSync(dir).filter(name => name.startsWith('lid-mapping'))) {
      const map = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      for (const [lid, jid] of Object.entries(map)) if (String(jid).includes(String(phone))) return lid;
    }
  } catch (_) {}
  return null;
}
function toJid(input) { const value = String(input || '').trim(); if (!value) return ''; if (/^\d+$/.test(value)) return findLidForPhone(value) || `${value}@s.whatsapp.net`; return value; }
// Decides what to do with an incoming call, strictly from the saved config:
//   1. whitelist                       -> allow (always)
//   2. schedule on, outside the window -> allow (anti-call is only active inside it)
//   3. blacklist (.anticall reject add)-> block (an explicit per-number rule; it
//                                         still applies when the general switch is off)
//   4. anticall OFF                    -> allow  (calls ring normally)
//   5. anticall ON                     -> reject, or reject + block when block mode is on
function resolveAction(call, config) {
  const ids = [call.from, call.callerPn, call.chatId].filter(Boolean).map(normalizeJid);
  if (ids.some((id) => isInList(id, config.whitelist))) return { action: 'allow', reason: 'whitelist' };
  if (config.schedule.enabled && !isWithinSchedule(config.schedule)) return { action: 'allow', reason: 'outside-schedule' };
  if (ids.some((id) => isInList(id, config.blacklist))) return { action: 'block', reason: 'blacklist' };
  if (!config.enabled) return { action: 'allow', reason: 'anticall-off' };
  return { action: config.mode === 'block' ? 'block' : 'reject', reason: 'unknown' };
}
module.exports = { lagosNow, CONFIG_PATH, defaultConfig, loadConfig, saveConfig, normalizeJid, isInBlacklist, isInWhitelist, isWithinSchedule, findLidForPhone, toJid, resolveAction };
  
