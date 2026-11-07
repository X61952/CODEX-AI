'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const commandPath = path.join(__dirname, '..', 'commands', 'economy', 'rob.js');
let db;
let saved;
let wantedStars;
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
    if (parent?.filename === commandPath && request === '../../lib/gtaEngine') {
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
    wantedStars = 0;
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

    assert.match(replies[0], /Rob successful/);
    assert.match(replies[0], /Stole \*100\*/);
    assert.match(replies[0], /Wanted: ⭐ 1/);
    assert.equal(db[targetPn].wallet, 900);
    assert.equal(db[targetLid], undefined);
    assert.equal(db['robber@s.whatsapp.net'].wallet, 600);
    assert.equal(saved, true);
    assert.equal(wantedStars, 1);
});

test('rob has no cooldown and a failed attempt raises wanted stars to two', async () => {
    const targetPn = '15551234567@s.whatsapp.net';
    const targetLid = '987654321@lid';
    db = {
        'robber@s.whatsapp.net': { wallet: 500, inventory: {}, cooldowns: {}, stats: {}, nerve: 100 },
        [targetPn]: { wallet: 1000, inventory: {}, cooldowns: {}, stats: {} },
    };
    saved = false;
    wantedStars = 0;
    const replies = [];
    const originalRandom = Math.random;
    Math.random = () => 0.99;

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

    assert.match(replies[0], /Rob failed/);
    assert.match(replies[0], /Wanted: ⭐ 2/);
    assert.equal(wantedStars, 2);
});

test('existing wanted stars make robbery riskier and increase police fines', async () => {
    const targetPn = '15551234567@s.whatsapp.net';
    const targetLid = '987654321@lid';
    db = {
        'robber@s.whatsapp.net': { wallet: 500, inventory: {}, cooldowns: {}, stats: {}, nerve: 100 },
        [targetPn]: { wallet: 1000, inventory: {}, cooldowns: {}, stats: {} },
    };
    saved = false;
    wantedStars = 5;
    const replies = [];
    const originalRandom = Math.random;
    Math.random = () => 0.5;

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

    assert.match(replies[0], /Rob failed/);
    assert.match(replies[0], /Fine: \*300\*/);
    assert.equal(db['robber@s.whatsapp.net'].wallet, 200);
    assert.equal(wantedStars, 5);
});
