'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const commandPath = path.join(__dirname, '..', 'commands', 'gta', 'activities.js');
const economyUser = { wallet: 100, xp: 0 };
const gtaUser = { skills: { stamina: 1 } };
const gtaDb = {};
const savedGta = [];
const actionCalls = [];
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
            fmt: amount => String(amount),
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
            assert.equal(actionCalls.at(-1), 'rob');
            assert.equal(savedGta.at(-1).db, gtaDb);
            assert.match(replies[0], /ROB complete/);
        }
    } finally {
        Math.random = originalRandom;
    }
});
