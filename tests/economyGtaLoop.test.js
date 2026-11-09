'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const adventurePath = path.join(__dirname, '..', 'lib', 'economyAdventure.js');
let economyUser;
let wantedStars;
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (parent?.filename === adventurePath && request === './economyEngine') {
        return {
            loadDB: () => ({ player: economyUser }),
            saveDB: () => {},
            getUser: () => economyUser,
            fmt: String,
            onCooldown: () => 0,
            setCooldown: () => {},
            addXP: (user, amount) => { user.xp = (user.xp || 0) + amount; },
        };
    }
    if (parent?.filename === adventurePath && request === './gtaEngine') {
        return {
            getGtaUser: () => ({ wantedStars }),
            addWantedStars: (_jid, amount) => {
                wantedStars = Math.min(5, wantedStars + amount);
                return wantedStars;
            },
            getWantedLabel: stars => `⭐ ${stars}`,
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

let runAdventure;
try {
    ({ runAdventure } = require(adventurePath));
} finally {
    Module._load = originalLoad;
}

test('criminal economy jobs pay into the shared wallet and add wanted heat', async () => {
    economyUser = { wallet: 1000, cooldowns: {}, stats: {} };
    wantedStars = 0;
    const replies = [];
    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
        await runAdventure(
            { sender: 'player', reply: async text => replies.push(text) },
            { key: 'smuggle', label: 'Smuggling Run', reward: [500, 500], wanted: true }
        );
    } finally {
        Math.random = originalRandom;
    }

    assert.equal(economyUser.wallet, 1500);
    assert.equal(economyUser.stats.earned, 500);
    assert.equal(wantedStars, 1);
    assert.match(replies[0], /Wanted: ⭐ 1/);
});

test('existing wanted heat increases criminal job failure risk', async () => {
    economyUser = { wallet: 1000, cooldowns: {}, stats: {} };
    wantedStars = 5;
    const replies = [];
    const originalRandom = Math.random;
    Math.random = () => 0.5;
    try {
        await runAdventure(
            { sender: 'player', reply: async text => replies.push(text) },
            { key: 'heist', label: 'Bank Heist', cost: 200, risk: 0.35, wanted: true }
        );
    } finally {
        Math.random = originalRandom;
    }

    assert.equal(economyUser.wallet, 800);
    assert.equal(economyUser.stats.spent, 200);
    assert.equal(wantedStars, 5);
    assert.match(replies[0], /operation failed/i);
});

test('economy storage stays in the project database when launched from another directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-economy-root-'));
    try {
        const enginePath = path.join(__dirname, '..', 'lib', 'economyEngine.js');
        execFileSync(process.execPath, [
            '-e',
            `const engine = require(${JSON.stringify(enginePath)}); engine.saveDB({ marker: { wallet: 42 } });`,
        ], {
            cwd: os.tmpdir(),
            env: { ...process.env, CODEX_PROJECT_ROOT: root },
        });

        const saved = JSON.parse(fs.readFileSync(path.join(root, 'database', 'economy.json'), 'utf8'));
        assert.equal(saved.marker.wallet, 42);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

const territoryPath = path.join(__dirname, '..', 'commands', 'gta', 'territory.js');
const territoryEconomyUser = { wallet: 0, cooldowns: {}, stats: {} };
const territoryGtaUser = { gang: 'grove', weapon: 'bat', cooldowns: {}, ammo: {}, respect: 0, stats: {} };
const territoryDb = { territories: [{ id: 'grove_st', name: 'Grove Street', gang: 'grove', value: 1000 }] };
const originalTerritoryLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (parent?.filename === territoryPath && request === '../../lib/gtaEngine') {
        return {
            getGtaUser: () => territoryGtaUser,
            saveGtaUser: () => {},
            getTerritories: () => territoryDb,
            saveTerritories: () => {},
            getGangDb: () => ({}),
            saveGangDb: () => {},
            GANGS: { grove: { emoji: '🌿', tag: 'GSF', name: 'Grove Street Families' } },
            WEAPONS: { bat: { damage: 15 }, fists: { damage: 5 } },
            getWantedLabel: stars => `⭐ ${stars}`,
        };
    }
    if (parent?.filename === territoryPath && request === '../../lib/economyEngine') {
        return {
            loadDB: () => ({ player: territoryEconomyUser }),
            saveDB: () => {},
            getUser: () => territoryEconomyUser,
            addXP: () => {},
            onCooldown: (user, key, duration) => {
                const remaining = duration - (Date.now() - (user.cooldowns[key] || 0));
                return remaining > 0 ? remaining : 0;
            },
            setCooldown: (user, key) => { user.cooldowns[key] = Date.now(); },
            formatCooldown: String,
            fmt: String,
        };
    }
    return originalTerritoryLoad.call(this, request, parent, isMain);
};

let territoryCommand;
try {
    territoryCommand = require(territoryPath);
} finally {
    Module._load = originalTerritoryLoad;
}

test('gangs can collect territory income into the economy wallet', async () => {
    territoryEconomyUser.wallet = 0;
    territoryEconomyUser.cooldowns = {};
    territoryEconomyUser.stats = {};
    const replies = [];

    await territoryCommand.execute(
        { prefix: '.' },
        { sender: 'player', reply: async text => replies.push(text) },
        ['collect']
    );

    assert.equal(territoryEconomyUser.wallet, 1000);
    assert.equal(territoryEconomyUser.stats.earned, 1000);
    assert.ok(territoryEconomyUser.cooldowns.territoryIncome > 0);
    assert.match(replies[0], /Collected \*1000\* codex/);

    await territoryCommand.execute(
        { prefix: '.' },
        { sender: 'player', reply: async text => replies.push(text) },
        ['collect']
    );
    assert.equal(territoryEconomyUser.wallet, 1000);
    assert.match(replies[1], /already collected/);
});

const wantedPath = path.join(__dirname, '..', 'commands', 'gta', 'wanted.js');
const wantedGtaUser = { wantedStars: 3, cooldowns: {} };
let savedWantedUser;
const originalWantedLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (parent?.filename === wantedPath && request === '../../lib/gtaEngine') {
        return {
            getGtaUser: () => wantedGtaUser,
            saveGtaUser: (_jid, user) => { savedWantedUser = user; },
            getWantedLabel: stars => `⭐ ${stars}`,
        };
    }
    if (parent?.filename === wantedPath && request === '../../lib/gtaFeatures') {
        return {
            user: () => ({ u: { properties: ['mansion'] } }),
        };
    }
    return originalWantedLoad.call(this, request, parent, isMain);
};

let wantedCommand;
try {
    wantedCommand = require(wantedPath);
} finally {
    Module._load = originalWantedLoad;
}

test('owned mansions let players lose two wanted stars without paying a fine', async () => {
    wantedGtaUser.wantedStars = 3;
    wantedGtaUser.cooldowns = {};
    savedWantedUser = undefined;
    const replies = [];

    await wantedCommand.execute(
        { prefix: '.' },
        { sender: 'player', reply: async text => replies.push(text) },
        ['laylow']
    );

    assert.equal(wantedGtaUser.wantedStars, 1);
    assert.ok(wantedGtaUser.cooldowns.laylow > 0);
    assert.equal(savedWantedUser, wantedGtaUser);
    assert.match(replies[0], /lost 2 wanted star/);
});
