'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

for (const [filename, commandName, example] of [
  ['screenshot.js', 'screenshot', '.screenshot https://example.com'],
  ['screenrecord.js', 'screenrecord', '.screenrecord https://example.com 5'],
]) {
  test(`${commandName} without a URL replies with usage when Playwright is missing`, () => {
    const commandPath = path.join(__dirname, '..', 'commands', 'general', filename);
    const script = `
    const Module = require('node:module');
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === 'playwright') {
        const error = new Error('Playwright is not installed');
        error.code = 'MODULE_NOT_FOUND';
        throw error;
      }
      return originalLoad.call(this, request, parent, isMain);
    };

    const command = require(${JSON.stringify(commandPath)});
    let replyText;
    command.execute({}, {}, {
      args: [],
      reply: async (text) => { replyText = text; },
    }).then(() => {
      if (!replyText) throw new Error('Expected a usage reply');
      if (!replyText.includes(${JSON.stringify(example)})) {
        throw new Error('Usage reply did not include an example URL');
      }
    }).catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf8',
    timeout: 10_000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
