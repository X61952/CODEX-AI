'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const commandPath = path.join(__dirname, '..', 'commands', 'gta', 'business.js');
const economyDB = {};
const businessUser = { businesses: ['taxi', 'ammu'] };
let saved;
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (parent?.filename === commandPath && request === '../../lib/gtaFeatures') {
        return {
            CATALOG: { businesses: { taxi: 50000, ammu: 150000, nightclub: 500000, cartel: 2000000 } },
            buy: () => ({ ok: false, message: 'not used' }),
            user: () => ({ db: {}, u: businessUser }),
        };
    }
    if (parent?.filename === commandPath && request === '../../lib/economyEngine') {
        return {
            loadDB: () => economyDB,
            saveDB: () => { saved = true; },
            getUser: (db, jid) => {
                if (!db[jid]) db[jid] = { wallet: 500, stats: {}, cooldowns: {} };
                return db[jid];
            },
            onCooldown: (user, key, duration) => {
                const remaining = duration - (Date.now() - (user.cooldowns[key] || 0));
                return remaining > 0 ? remaining : 0;
            },
            setCooldown: (user, key) => { user.cooldowns[key] = Date.now(); },
            formatCooldown: ms => `${Math.ceil(ms / 1000)}s`,
            fmt: amount => Number(amount).toLocaleString(),
            CURRENCY: 'coins',
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

let command;
try {
    command = require(commandPath);
} finally {
    Module._load = originalLoad;
}

test('business collection credits 2% of owned business value to the shared wallet once per day', async () => {
    const economyUser = economyDB.player = { wallet: 500, stats: {}, cooldowns: {} };
    saved = false;
    const replies = [];

    await command.execute(
        { prefix: '.' },
        { sender: 'player', reply: async text => replies.push(text) },
        ['collect']
    );

    assert.equal(economyUser.wallet, 4500);
    assert.equal(economyUser.stats.earned, 4000);
    assert.equal(economyUser.cooldowns.businessIncome > 0, true);
    assert.match(replies[0], /Collected \*4,000\* coins/);
    assert.equal(saved, true);

    saved = false;
    await command.execute(
        { prefix: '.' },
        { sender: 'player', reply: async text => replies.push(text) },
        ['collect']
    );
    assert.equal(economyUser.wallet, 4500);
    assert.match(replies[1], /already collected/);
    assert.equal(saved, false);
});
