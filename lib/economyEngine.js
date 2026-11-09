/**
 * CODEX AI — Economy Engine
 * Handles all economy data: wallet, bank, inventory, XP/levels, cooldowns
 * Currency: codex 💵 (displayed in bold as *codex* 💵)
 */

const fs = require('fs-extra');
const path = require('path');

const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');
const DB_PATH = path.join(PROJECT_ROOT, 'database', 'economy.json');
const CURRENCY = '*codex* 💵';

// ── XP per level ───────────────────────────────────────────────────────────
const XP_TABLE = [0,100,250,500,900,1400,2100,3000,4200,5800,8000];
// Level  0   1    2    3    4    5    6    7    8    9    10+

function xpForLevel(level) {
    if (level >= XP_TABLE.length) return XP_TABLE[XP_TABLE.length - 1] + (level - XP_TABLE.length + 1) * 3000;
    return XP_TABLE[level] || 0;
}

// ── Shop items ─────────────────────────────────────────────────────────────
const SHOP_ITEMS = {
    shield:     { name: 'Shield',        price: 500,  desc: 'Protects you from 1 rob attempt' },
    fishingrod: { name: 'Fishing Rod',   price: 300,  desc: '+50% fish earnings for 10 catches' },
    pickaxe:    { name: 'Pickaxe',       price: 400,  desc: '+50% mine earnings for 10 mines' },
    rifle:      { name: 'Rifle',         price: 450,  desc: '+50% hunt earnings for 10 hunts' },
    lockpick:   { name: 'Lockpick',      price: 600,  desc: '+20% rob success rate for next rob' },
    luckycharm: { name: 'Lucky Charm',   price: 800,  desc: '+10% win rate on gambling for 5 uses' },
};

// ── Load / Save ────────────────────────────────────────────────────────────
function loadDB() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch { return {}; }
}

function saveDB(db) {
    fs.ensureDirSync(path.dirname(DB_PATH));
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ── Get or create user profile ─────────────────────────────────────────────
function getUser(db, jid) {
    if (!db[jid]) db[jid] = {};
    const u = db[jid];
    // Core economy
    if (u.wallet    === undefined) u.wallet    = 0;
    if (u.bank      === undefined) u.bank      = 0;
    if (u.xp        === undefined) u.xp        = 0;
    if (u.level     === undefined) u.level     = 1;
    if (!u.inventory)  u.inventory  = {};
    if (!u.cooldowns)  u.cooldowns  = {};
    if (!u.stats)      u.stats      = { earned: 0, spent: 0, lost: 0 };
    if (u.stats.earned === undefined) u.stats.earned = 0;
    if (u.stats.spent  === undefined) u.stats.spent  = 0;
    if (u.stats.lost   === undefined) u.stats.lost   = 0;
    // Streak
    if (u.streak       === undefined) u.streak       = 0;
    if (u.lastDaily    === undefined) u.lastDaily     = 0;
    // Battle stats
    if (!u.battle) u.battle = { str: 10, def: 10, spd: 10, dex: 10, wins: 0, losses: 0 };
    if (u.battle.str     === undefined) u.battle.str     = 10;
    if (u.battle.def     === undefined) u.battle.def     = 10;
    if (u.battle.spd     === undefined) u.battle.spd     = 10;
    if (u.battle.dex     === undefined) u.battle.dex     = 10;
    if (u.battle.wins    === undefined) u.battle.wins    = 0;
    if (u.battle.losses  === undefined) u.battle.losses  = 0;
    // Status
    if (u.nerve    === undefined) u.nerve    = 100;
    if (u.maxNerve === undefined) u.maxNerve = 100;
    if (u.energy   === undefined) u.energy   = 100;
    if (u.maxEnergy=== undefined) u.maxEnergy= 100;
    if (u.health   === undefined) u.health   = 'Healthy';
    // Shield
    if (u.shield       === undefined) u.shield       = null;
    if (u.autoShield   === undefined) u.autoShield   = false;
    // Location / travel
    if (!u.location) u.location = 'Lagos';
    // Crypto
    if (!u.crypto)   u.crypto   = {};
    if (u.cryptoValue === undefined) u.cryptoValue = 0;
    // Pet
    if (!u.pet) u.pet = null;
    // Assets count
    if (u.assets === undefined) u.assets = 0;
    // Profile card
    if (!u.profileCard) u.profileCard = {};
    return u;
}

// ── Cooldown helpers ───────────────────────────────────────────────────────
function onCooldown(user, key, ms) {
    const last = user.cooldowns[key] || 0;
    const diff = Date.now() - last;
    return diff < ms ? ms - diff : 0;
}

function setCooldown(user, key) {
    user.cooldowns[key] = Date.now();
}

function formatCooldown(ms) {
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60), rem = s % 60;
    if (m < 60) return `${m}m ${rem}s`;
    const h = Math.floor(m / 60), rm = m % 60;
    return `${h}h ${rm}m`;
}

// ── Level-up check ─────────────────────────────────────────────────────────
function checkLevelUp(user) {
    const needed = xpForLevel(user.level + 1);
    if (user.xp >= needed) {
        user.level += 1;
        return true;
    }
    return false;
}

function addXP(user, amount) {
    user.xp += amount;
    return checkLevelUp(user);
}

// ── Inventory helpers ──────────────────────────────────────────────────────
function hasItem(user, item) {
    return (user.inventory[item] || 0) > 0;
}

function addItem(user, item, qty = 1) {
    user.inventory[item] = (user.inventory[item] || 0) + qty;
}

function removeItem(user, item, qty = 1) {
    user.inventory[item] = Math.max(0, (user.inventory[item] || 0) - qty);
    if (!user.inventory[item]) delete user.inventory[item];
}

// ── Leaderboard ────────────────────────────────────────────────────────────
function getLeaderboard(db, limit = 10) {
    return Object.entries(db)
        .map(([jid, u]) => ({ jid, total: (u.wallet || 0) + (u.bank || 0), level: u.level || 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);
}

// ── Format number ──────────────────────────────────────────────────────────
function fmt(n) {
    return Number(n).toLocaleString();
}

module.exports = {
    DB_PATH, CURRENCY, SHOP_ITEMS, XP_TABLE,
    loadDB, saveDB, getUser,
    onCooldown, setCooldown, formatCooldown,
    addXP, checkLevelUp, xpForLevel,
    hasItem, addItem, removeItem,
    getLeaderboard, fmt
};
