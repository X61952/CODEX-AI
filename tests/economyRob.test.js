'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const commandPath = path.join(__dirname, '..', 'commands', 'economy', 'rob.js');
let db;
let saved;
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (parent?.filename === commandPath && request === '../../lib/economyEngine') {
        return {
            loadDB: () => db,
            saveDB: () => { saved = true; },
            getUser: (store, jid) => {
                if (!store[jid]) {
                    store[jid] = { wallet: 0, inventory: {}, cooldowns: {}, stats: {}, nerve: 100 };
                }
                return store[jid];
            },
            onCooldown: () => 0,
            setCooldown: (user, key) => { user.cooldowns[key] = Date.now(); },
            formatCooldown: String,
            addXP: () => {},
            hasItem: (user, item) => (user.inventory[item] || 0) > 0,
            removeItem: (user, item) => { delete user.inventory[item]; },
            fmt: String,
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

test('rob reads the phone-JID wallet when a tagged user is identified by LID', async () => {
    const targetPn = '15551234567@s.whatsapp.net';
    const targetLid = '987654321@lid';
    db = {
        'robber@s.whatsapp.net': { wallet: 500, inventory: {}, cooldowns: {}, stats: {}, nerve: 100 },
        [targetPn]: { wallet: 1000, inventory: {}, cooldowns: {}, stats: {} },
    };
    saved = false;
    const replies = [];
    const originalRandom = Math.random;
    Math.random = () => 0;

    try {
        await command.execute(
            {
                sock: {
                    signalRepository: {
                        lidMapping: { getPNForLID: async () => targetPn },
                    },
                },
            },
            {
                sender: 'robber@s.whatsapp.net',
                mentions: [targetLid],
                reply: async text => replies.push(text),
            },
            []
        );
    } finally {
        Math.random = originalRandom;
    }

    assert.match(replies[0], /ROB SUCCESSFUL/);
    assert.match(replies[0], /Stolen: \+\*100\*/);
    assert.equal(db[targetPn].wallet, 900);
    assert.equal(db[targetLid], undefined);
    assert.equal(db['robber@s.whatsapp.net'].wallet, 600);
    assert.equal(saved, true);
});
