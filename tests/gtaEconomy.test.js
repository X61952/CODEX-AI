'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const commandPath = path.join(__dirname, '..', 'commands', 'gta', 'activities.js');
const economyUser = { wallet: 100, xp: 0, stats: {} };
const gtaUser = { skills: { stamina: 1 }, vehicles: [] };
const gtaDb = {};
const savedGta = [];
const actionCalls = [];
let wantedStars = 0;
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (parent?.filename === commandPath && request === '../../lib/gtaFeatures') {
        return {
            action: (_jid, activity) => {
                actionCalls.push(activity);
                return { ok: true };
            },
            user: () => ({ db: gtaDb, u: gtaUser }),
            save: (jid, user, db) => savedGta.push({ jid, user, db }),
        };
    }

    if (parent?.filename === commandPath && request === '../../lib/economyEngine') {
        return {
            loadDB: () => ({}),
            saveDB: () => {},
            getUser: () => economyUser,
            addXP: (user, amount) => { user.xp += amount; },
            fmt: amount => String(amount),
        };
    }
    if (parent?.filename === commandPath && request === '../../lib/gtaEngine') {
        return {
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

test('GTA rob activity shares the economy wallet without taking the economy rob alias', async () => {
    assert.ok(!command.aliases.includes('rob'));
    assert.ok(command.aliases.includes('gtarob'));

    const originalRandom = Math.random;
    Math.random = () => 0;
    wantedStars = 0;
    try {
        for (const [name, args] of [['activities', ['rob']], ['gtarob', []]]) {
            const walletBefore = economyUser.wallet;
            const replies = [];
            await command.execute(
                { prefix: '.' },
                { sender: 'player@s.whatsapp.net', reply: async text => replies.push(text) },
                args,
                name
            );

            assert.equal(economyUser.wallet, walletBefore + 500);
            assert.equal(economyUser.stats.earned >= 500, true);
            assert.equal(actionCalls.at(-1), 'rob');
            assert.equal(savedGta.at(-1).db, gtaDb);
            assert.match(replies[0], /ROB complete/);
            assert.match(replies[0], /Wanted: ⭐/);
        }
    } finally {
        Math.random = originalRandom;
    }
});

test('a purchased vehicle boosts race earnings and requires no separate economy', async () => {
    gtaUser.vehicles = ['infernus'];
    economyUser.wallet = 100;
    economyUser.stats = {};
    economyUser.xp = 0;
    const replies = [];
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
        await command.execute(
            { prefix: '.' },
            { sender: 'player@s.whatsapp.net', reply: async text => replies.push(text) },
            [],
            'race'
        );
    } finally {
        Math.random = originalRandom;
    }

    assert.equal(economyUser.wallet, 505);
    assert.equal(economyUser.stats.earned, 405);
    assert.match(replies[0], /Vehicle bonus: \+35%/);
});
