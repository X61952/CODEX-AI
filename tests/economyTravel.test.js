'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const commandPath = path.join(__dirname, '..', 'commands', 'economy', 'travel.js');
let db;
let saved;
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (parent?.filename === commandPath && request === '../../lib/economyEngine') {
        return {
            loadDB: () => db,
            saveDB: () => { saved = true; },
            getUser: (store, jid) => {
                const user = store[jid];
                if (user.wallet === undefined) user.wallet = 0;
                if (user.bank === undefined) user.bank = 0;
                if (user.xp === undefined) user.xp = 0;
                if (user.level === undefined) user.level = 1;
                user.cooldowns ||= {};
                return user;
            },
            onCooldown: (user, key, duration) => {
                const remaining = duration - (Date.now() - (user.cooldowns[key] || 0));
                return remaining > 0 ? remaining : 0;
            },
            setCooldown: (user, key) => { user.cooldowns[key] = Date.now(); },
            formatCooldown: ms => `${Math.ceil(ms / 1000)}s`,
            addXP: (user, amount) => { user.xp += amount; },
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

test('travel migrates legacy-only funds and uses the shared wallet for costs and rewards', async () => {
    db = {
        player: { balance: 2000, bank: 0, level: 1, xp: 0, lastTravel: 0 },
    };
    saved = false;
    const replies = [];
    const originalRandom = Math.random;
    const randomValues = [0.9, 0];
    Math.random = () => randomValues.shift() ?? 0;

    try {
        await command.execute(
            { prefix: '.' },
            { sender: 'player', reply: async text => replies.push(text) },
            ['Lagos']
        );
    } finally {
        Math.random = originalRandom;
    }

    assert.equal(db.player.wallet, 1700);
    assert.equal(db.player.balance, undefined);
    assert.equal(db.player.xp, 10);
    assert.equal(db.player.location, 'Lagos');
    assert.match(replies[0], /Wallet: \*1,700\* coins/);
    assert.equal(saved, true);
});

test('travel does not merge legacy balance into an existing economy wallet', async () => {
    db = {
        player: { balance: 2000, wallet: 600, bank: 0, level: 1, xp: 0, lastTravel: 0 },
    };
    saved = false;
    const replies = [];
    const originalRandom = Math.random;
    const randomValues = [0.9, 0];
    Math.random = () => randomValues.shift() ?? 0;

    try {
        await command.execute(
            { prefix: '.' },
            { sender: 'player', reply: async text => replies.push(text) },
            ['Lagos']
        );
    } finally {
        Math.random = originalRandom;
    }

    assert.equal(db.player.wallet, 300);
    assert.equal(db.player.balance, undefined);
    assert.match(replies[0], /Wallet: \*300\* coins/);
});
