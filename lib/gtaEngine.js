// ── GTA San Andreas Economy Engine ────────────────────────────────────────────
const fs   = require('fs-extra');
const path = require('path');
// Anchored to the project root (not process.cwd()) so persistent data
// lands in the same place regardless of the directory the process was
// launched from.
// CODEX_PROJECT_ROOT lets tests (and only tests) redirect persistent
// storage to a throwaway directory; production never sets it, so this
// always resolves to the real install directory there.
const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');


const GTA_DB    = path.join(PROJECT_ROOT, 'database/gta.json');
const GANG_DB   = path.join(PROJECT_ROOT, 'database/gangs.json');
const TERR_DB   = path.join(PROJECT_ROOT, 'database/territories.json');

const readDb  = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } };
const saveDb  = (p, d) => { fs.ensureDirSync(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(d, null, 2)); };

// ── Constants ──────────────────────────────────────────────────────────────────
const GANGS = {
    grove:   { name: 'Grove Street Families', tag: '🟢 GSF', color: 'Green',  leader: 'CODEX', emoji: '🌿' },
    ballas:  { name: 'Ballas',                tag: '🟣 BAL', color: 'Purple', leader: null,    emoji: '💜' },
    vagos:   { name: 'Vagos',                 tag: '🟡 VAG', color: 'Yellow', leader: null,    emoji: '🌕' },
    aztecas: { name: 'Varrio Los Aztecas',    tag: '🔵 VLA', color: 'Blue',   leader: null,    emoji: '🔵' },
};

const TERRITORIES = [
    { id: 'grove_st',  name: 'Grove Street',    gang: 'grove',   value: 500  },
    { id: 'ganton',    name: 'Ganton',           gang: 'grove',   value: 400  },
    { id: 'idlewood',  name: 'Idlewood',         gang: 'ballas',  value: 600  },
    { id: 'willowfield',name:'Willowfield',      gang: 'ballas',  value: 350  },
    { id: 'east_ls',   name: 'East Los Santos',  gang: 'vagos',   value: 450  },
    { id: 'maywood',   name: 'Maywood',          gang: 'vagos',   value: 380  },
    { id: 'el_corona', name: 'El Corona',        gang: 'aztecas', value: 420  },
    { id: 'unity_st',  name: 'Unity Station',    gang: null,      value: 700  },
    { id: 'commerce',  name: 'Commerce',         gang: null,      value: 800  },
    { id: 'downtown',  name: 'Downtown LS',      gang: null,      value: 1000 },
];

const WEAPONS = {
    fists:      { name: 'Fists',           price: 0,     damage: 5,  emoji: '👊' },
    bat:        { name: 'Baseball Bat',    price: 200,   damage: 15, emoji: '🏏' },
    knife:      { name: 'Knife',           price: 300,   damage: 20, emoji: '🔪' },
    pistol:     { name: 'Pistol',          price: 500,   damage: 30, emoji: '🔫' },
    shotgun:    { name: 'Shotgun',         price: 1500,  damage: 55, emoji: '🔫' },
    uzi:        { name: 'Uzi',             price: 2000,  damage: 40, emoji: '🔫' },
    ak47:       { name: 'AK-47',           price: 5000,  damage: 70, emoji: '🔫' },
    m4:         { name: 'M4',              price: 8000,  damage: 80, emoji: '🔫' },
    sniper:     { name: 'Sniper Rifle',    price: 10000, damage: 95, emoji: '🎯' },
    rpg:        { name: 'RPG',             price: 25000, damage: 150,emoji: '💥' },
};

const ARMOR = {
    none:       { name: 'No Armor',        price: 0,     protect: 0,   emoji: '👕' },
    vest:       { name: 'Body Vest',        price: 1000,  protect: 25,  emoji: '🦺' },
    bulletproof:{ name: 'Bulletproof Vest', price: 5000,  protect: 50,  emoji: '🛡️' },
    military:   { name: 'Military Armor',   price: 15000, protect: 75,  emoji: '⚔️' },
    fullsuit:   { name: 'Full Body Suit',   price: 30000, protect: 90,  emoji: '🔰' },
};

const WANTED_LEVELS = [
    { stars: 0, label: 'Clean',       color: '⚪' },
    { stars: 1, label: 'Wanted',      color: '⭐' },
    { stars: 2, label: 'Pursuit',     color: '⭐⭐' },
    { stars: 3, label: 'Felony',      color: '⭐⭐⭐' },
    { stars: 4, label: 'SWAT',        color: '⭐⭐⭐⭐' },
    { stars: 5, label: 'FBI',         color: '⭐⭐⭐⭐⭐' },
];

const CHARACTERS = {
    cj:       { name: 'CJ (Carl Johnson)',  role: 'Grove Street OG',  emoji: '🟢' },
    big_smoke:{ name: 'Big Smoke',          role: 'Traitor / Boss',   emoji: '💨' },
    sweet:    { name: 'Sweet',              role: 'Grove St Leader',  emoji: '🟩' },
    ryder:    { name: 'Ryder',              role: 'Grove OG',         emoji: '🔫' },
    kendl:    { name: 'Kendl',              role: 'CJ\'s Sister',     emoji: '💚' },
    tenpenny: { name: 'Officer Tenpenny',   role: 'Corrupt Cop',      emoji: '👮' },
    cesar:    { name: 'Cesar Vialpando',    role: 'Aztecas Leader',   emoji: '🔵' },
    og_loc:   { name: 'OG Loc',             role: 'Rapper/Clown',     emoji: '🎤' },
    toreno:   { name: 'Mike Toreno',        role: 'Secret Agent',     emoji: '🕵️' },
    woozie:   { name: 'Woozie',             role: 'Triad Boss',       emoji: '🀄' },
};

const EVENTS = {
    drive_by:    { name: 'Drive-By',       reward: [500,2000],   wantedGain: 2, desc: 'Shoot up an enemy territory' },
    turf_war:    { name: 'Turf War',       reward: [1000,5000],  wantedGain: 3, desc: 'Attack a rival gang turf' },
    heist:       { name: 'Heist',          reward: [5000,20000], wantedGain: 4, desc: 'Rob a bank or store' },
    drug_deal:   { name: 'Drug Deal',      reward: [300,1500],   wantedGain: 1, desc: 'Make a transaction' },
    race:        { name: 'Street Race',    reward: [200,3000],   wantedGain: 0, desc: 'Race for pink slips' },
    bounty:      { name: 'Bounty Hunt',    reward: [800,4000],   wantedGain: 1, desc: 'Hunt down a target' },
    mission:     { name: 'Gang Mission',   reward: [600,3000],   wantedGain: 2, desc: 'Complete a gang mission' },
};

// ── User GTA profile ───────────────────────────────────────────────────────────
function getGtaUser(jid) {
    const db   = readDb(GTA_DB);
    if (!db[jid]) db[jid] = {};
    const u = db[jid];
    if (!u.gang)        u.gang        = null;
    if (!u.rank)        u.rank        = 'Homie';
    if (u.health       === undefined) u.health       = 100;
    if (u.maxHealth    === undefined) u.maxHealth    = 100;
    if (u.armor        === undefined) u.armor        = 0;
    if (!u.weapon)      u.weapon      = 'fists';
    if (!u.weapons)     u.weapons     = ['fists'];
    if (!u.armor_type)  u.armor_type  = 'none';
    if (u.wantedStars  === undefined) u.wantedStars  = 0;
    if (u.kills        === undefined) u.kills        = 0;
    if (u.deaths       === undefined) u.deaths       = 0;
    if (!u.territories) u.territories = [];
    if (!u.stats)       u.stats       = { missions: 0, heists: 0, kills: 0 };
    if (!u.faction)     u.faction     = null;
    if (u.respect      === undefined) u.respect      = 0;
    if (!u.cooldowns)   u.cooldowns   = {};
    if (!u.ammo)        u.ammo        = { pistol: 0, shotgun: 0, uzi: 0, ak47: 0, m4: 0, sniper: 0, rpg: 0 };
    saveGtaUser(jid, u, db);
    return u;
}

function saveGtaUser(jid, u, db) {
    if (!db) db = readDb(GTA_DB);
    db[jid] = u;
    saveDb(GTA_DB, db);
}

function addWantedStars(jid, amount = 1) {
    const user = getGtaUser(jid);
    user.wantedStars = Math.min(5, (user.wantedStars || 0) + amount);
    saveGtaUser(jid, user);
    return user.wantedStars;
}

function getGangDb()   { return readDb(GANG_DB); }
function saveGangDb(d) { saveDb(GANG_DB, d); }
function getTerritories() {
    const db = readDb(TERR_DB);
    if (!db.territories) {
        db.territories = TERRITORIES.map(t => ({ ...t }));
        saveDb(TERR_DB, db);
    }
    return db;
}
function saveTerritories(d) { saveDb(TERR_DB, d); }

function getWantedLabel(stars) {
    const w = WANTED_LEVELS[Math.min(stars, 5)];
    return `${w.color} *${w.label}*`;
}

function getRankByRespect(respect) {
    if (respect >= 5000) return '👑 OG Legend';
    if (respect >= 2000) return '💀 Shot Caller';
    if (respect >= 1000) return '⚔️ Banger';
    if (respect >= 500)  return '🔫 Soldier';
    if (respect >= 200)  return '🌿 Homie';
    return '🐣 Recruit';
}

function fmtAmmo(u) {
    const ammo = u.ammo || {};
    return Object.entries(ammo)
        .filter(([,v]) => v > 0)
        .map(([k,v]) => `${WEAPONS[k]?.emoji || '🔫'} ${k}: ${v}`)
        .join(', ') || 'No ammo';
}

module.exports = {
    GANGS, TERRITORIES, WEAPONS, ARMOR, WANTED_LEVELS, CHARACTERS, EVENTS,
    getGtaUser, saveGtaUser, addWantedStars, getGangDb, saveGangDb, getTerritories, saveTerritories,
    getWantedLabel, getRankByRespect, fmtAmmo, readDb, saveDb, GTA_DB, GANG_DB, TERR_DB
};
