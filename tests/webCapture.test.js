'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CaptureError,
  ensureChromiumInstalled,
  getUserError,
  isPublicAddress,
  normalizeTargetUrl,
  resolvePublicHost,
  validateTarget,
} = require('../lib/webCapture');

test('skips Chromium installation when the browser executable already exists', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-browser-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const executablePath = path.join(directory, 'chrome');
  await fs.writeFile(executablePath, '');
  let installCalls = 0;

  const installed = await ensureChromiumInstalled({
    chromium: { executablePath: () => executablePath },
    install: async () => { installCalls++; },
  });

  assert.equal(installed, false);
  assert.equal(installCalls, 0);
});

test('installs Chromium once when the executable is missing', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-browser-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const executablePath = path.join(directory, 'chrome');
  let installCalls = 0;

  const installed = await ensureChromiumInstalled({
    chromium: { executablePath: () => executablePath },
    install: async () => {
      installCalls++;
      await fs.writeFile(executablePath, '');
    },
  });

  assert.equal(installed, true);
  assert.equal(installCalls, 1);
});

test('normalizes public website URLs and adds HTTPS when omitted', () => {
  assert.equal(normalizeTargetUrl('example.com/path').href, 'https://example.com/path');
  assert.equal(normalizeTargetUrl('http://example.com/').href, 'http://example.com/');
});

test('rejects unsupported protocols, credentials, and nonstandard ports', () => {
  for (const input of [
    'file:///etc/passwd',
    'ftp://example.com/',
    'https://user:pass@example.com/',
    'https://example.com:8443/',
    'http://example.com:443/',
  ]) {
    assert.throws(() => normalizeTargetUrl(input), CaptureError, input);
  }
});

test('rejects private, loopback, link-local, and reserved IP addresses', () => {
  for (const address of [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.2.10',
    '192.168.1.1',
    '198.18.0.1',
    '203.0.113.4',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    '2002:7f00:1::1',
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
});

test('allows globally routable IPv4 and IPv6 addresses', () => {
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('1.1.1.1'), true);
  assert.equal(isPublicAddress('2001:4860:4860::8888'), true);
});

test('rejects local hostnames and names resolving to any private address', async () => {
  await assert.rejects(validateTarget('http://localhost'), { code: 'UNSAFE_URL' });
  await assert.rejects(
    validateTarget('https://public.example', async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]),
    { code: 'UNSAFE_URL' },
  );
});

test('rejects DNS failures with a user-friendly error', async () => {
  await assert.rejects(
    resolvePublicHost('missing.example', async () => {
      const error = new Error('ENOTFOUND');
      error.code = 'ENOTFOUND';
      throw error;
    }),
    { code: 'DNS_ERROR' },
  );
  assert.match(getUserError(new CaptureError('DNS_ERROR'), 'screenshot'), /could not be resolved/i);
});

test('reports a professional validation error for invalid recording duration', () => {
  assert.match(getUserError(new CaptureError('INVALID_DURATION'), 'screenrecord'), /between 1 and 10 seconds/i);
});

test('reports a clear error when host startup cannot install Chromium', () => {
  assert.match(
    getUserError(new CaptureError('BROWSER_INSTALL_FAILED'), 'screenshot'),
    /host could not install the browser/i,
  );
});
