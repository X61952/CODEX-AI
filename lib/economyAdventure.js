const { loadDB, saveDB, getUser, fmt, onCooldown, setCooldown, addXP } = require('./economyEngine');
const { getGtaUser, addWantedStars, getWantedLabel } = require('./gtaEngine');

function runAdventure(m, {
  key,
  label,
  cost = 0,
  reward = [500, 2000],
  cooldown = 15 * 60 * 1000,
  risk = 0.25,
  xp = 25,
  text,
  wanted = false,
}) {
  const db = loadDB(); const user = getUser(db, m.sender); const left = onCooldown(user, key, cooldown);
  if (left) return m.reply(`Cooldown active: ${Math.ceil(left / 60000)} minutes remaining.`);
  if ((user.wallet || 0) < cost) return m.reply(`You need ${fmt(cost)} coins.`);
  user.wallet -= cost; user.stats.spent = (user.stats.spent || 0) + cost; setCooldown(user, key);
  const gta = wanted ? getGtaUser(m.sender) : null;
  const heatRisk = wanted ? Math.min(0.9, risk + (gta.wantedStars || 0) * 0.05) : risk;
  const won = Math.random() >= heatRisk;
  const wantedStars = wanted
    ? addWantedStars(m.sender, won ? 1 : 2)
    : null;
  const wantedStatus = wanted ? `\nWanted: ${getWantedLabel(wantedStars)}.` : '';

  if (won) {
    const amount = Math.floor(Math.random() * (reward[1] - reward[0] + 1)) + reward[0];
    user.wallet += amount;
    user.stats.earned = (user.stats.earned || 0) + amount;
    addXP(user, xp);
    saveDB(db);
    return m.reply(`${label}\n${text || 'Operation completed.'}\nReward: ${fmt(amount)} coins.${wantedStatus}`);
  }

  saveDB(db);
  return m.reply(`${label}\nThe operation failed. Cost lost: ${fmt(cost)} coins.${wantedStatus}`);
}
module.exports = { runAdventure };
