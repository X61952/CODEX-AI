'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const commandPath = path.join(__dirname, '..', 'commands', 'economy', 'crime.js');
let user;
let wantedStars;
let saved;
let checkedCooldown;
const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    if (parent?.filename === commandPath && request === '../../lib/economyEngine') {
        return {
            loadDB: () => ({ player: user }),
            saveDB: () => { saved = true; },
            getUser: () => user,
            onCooldown: (_user, _key, duration) => {
                checkedCooldown = duration;
                return 0;
            },
            setCooldown: () => {},
            formatCooldown: String,
            addXP: () => {},
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

async function runCrime(randomValues, initialStars = 0) {
    user = { wallet: 1000, stats: {}, nerve: 100 };
    wantedStars = initialStars;
    saved = false;
    checkedCooldown = 0;
    const replies = [];
    const originalRandom = Math.random;
    Math.random = () => randomValues.shift() ?? 0;
    try {
        await command.execute(
            {},
            { sender: 'player@s.whatsapp.net', reply: async text => replies.push(text) },
            []
        );
    } finally {
        Math.random = originalRandom;
    }
    return replies[0];
}

test('crime success adds one GTA wanted star and uses a five-minute cooldown', async () => {
    const reply = await runCrime([0, 0.9, 0]);

    assert.match(reply, /Crime successful/);
    assert.match(reply, /Wanted: ⭐ 1/);
    assert.equal(wantedStars, 1);
    assert.equal(checkedCooldown, 5 * 60 * 1000);
    assert.equal(saved, true);
});

test('getting caught adds two wanted stars, capped at five', async () => {
    const reply = await runCrime([0, 0, 0], 4);

    assert.match(reply, /Crime failed/);
    assert.match(reply, /Wanted: ⭐ 5/);
    assert.equal(wantedStars, 5);
    assert.equal(user.wallet, 720);
});

test('existing wanted stars increase the chance of being caught', async () => {
    const reply = await runCrime([0, 0.5, 0], 4);

    assert.match(reply, /Crime failed/);
    assert.match(reply, /Fine: \*280\*/);
    assert.equal(wantedStars, 5);
});
