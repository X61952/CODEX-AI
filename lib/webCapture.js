'use strict';

const dns = require('node:dns').promises;
const fs = require('node:fs/promises');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const VIEWPORT = { width: 1280, height: 720 };
const MAX_SCREENSHOT_HEIGHT = 10_000;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const NAVIGATION_TIMEOUT_MS = 15_000;
const NETWORK_TIMEOUT_MS = 10_000;
const MAX_ACTIVE_CAPTURES = 2;
const MAX_QUEUED_CAPTURES = 4;

class CaptureError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'CaptureError';
    this.code = code;
  }
}

let browserPromise;
let activeCaptures = 0;
const captureQueue = [];

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || b === 2 || b === 168 || (b === 88 && c === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  if (family !== 6) return false;
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) return false;

  const halves = normalized.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const words = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    .map((word) => Number.parseInt(word, 16));
  if (words.length !== 8) return false;

  const first = words[0];
  const second = words[1];
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2001 && second <= 0x01ff) return false;
  if (first === 0x2001 && second === 0x0db8) return false;
  if (first === 0x2002) return false;
  if (first === 0x3fff && (second & 0xfff0) === 0) return false;
  return true;
}

function normalizeTargetUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) {
    throw new CaptureError('INVALID_URL');
  }

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new CaptureError('INVALID_URL');
  }

  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new CaptureError('INVALID_URL');
  }
  if (url.username || url.password) {
    throw new CaptureError('INVALID_URL');
  }
  if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) {
    throw new CaptureError('UNSAFE_URL');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (hostname.includes('%') || /(?:^|\.)(?:localhost|local|internal|test|example|invalid)$/.test(hostname)) {
    throw new CaptureError('UNSAFE_URL');
  }

  url.hash = '';
  return url;
}

async function resolvePublicHost(hostname, lookup = dns.lookup) {
  const address = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  const family = net.isIP(address);
  if (family) {
    if (!isPublicAddress(address)) throw new CaptureError('UNSAFE_URL');
    return [{ address, family }];
  }

  let addresses;
  try {
    addresses = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new CaptureError('DNS_ERROR')), 3_000);
      timer.unref?.();
      lookup(address, { all: true, verbatim: true }).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError('DNS_ERROR', undefined, { cause: error });
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new CaptureError('DNS_ERROR');
  }
  if (addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new CaptureError('UNSAFE_URL');
  }
  return addresses;
}

async function validateTarget(value, lookup) {
  const url = normalizeTargetUrl(value);
  await resolvePublicHost(url.hostname, lookup);
  return url;
}

function denyRequest(response, statusCode, reason) {
  response.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-codex-capture-block': reason,
  });
  response.end('Request blocked by the website capture safety proxy.');
}

function cleanProxyHeaders(headers, host) {
  const clean = { ...headers, host, connection: 'close' };
  for (const name of [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    delete clean[name];
  }
  clean.host = host;
  clean.connection = 'close';
  return clean;
}

async function createSafeProxy({ lookup = dns.lookup } = {}) {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    void (async () => {
      let target;
      try {
        target = await validateTarget(request.url, lookup);
      } catch (error) {
        const status = error.code === 'UNSAFE_URL' || error.code === 'INVALID_URL' ? 403 : 502;
        denyRequest(response, status, error.code || 'NETWORK_ERROR');
        return;
      }

      if (!['GET', 'HEAD'].includes(request.method)) {
        denyRequest(response, 405, 'METHOD_NOT_ALLOWED');
        return;
      }

      const addresses = await resolvePublicHost(target.hostname, lookup);
      const selected = addresses.find(({ family: addressFamily }) => addressFamily === 4) || addresses[0];
      const outgoing = http.request({
        hostname: selected.address,
        family: selected.family,
        port: Number(target.port || 80),
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: cleanProxyHeaders(request.headers, target.host),
        agent: false,
        timeout: NETWORK_TIMEOUT_MS,
      }, (upstream) => {
        const headers = { ...upstream.headers };
        for (const name of [
          'connection',
          'keep-alive',
          'proxy-authenticate',
          'proxy-authorization',
          'te',
          'trailer',
          'transfer-encoding',
          'upgrade',
        ]) delete headers[name];
        response.writeHead(upstream.statusCode || 502, headers);
        upstream.pipe(response);
      });

      outgoing.on('timeout', () => outgoing.destroy(new CaptureError('TIMEOUT')));
      outgoing.on('error', () => {
        if (!response.headersSent) denyRequest(response, 502, 'UPSTREAM_ERROR');
        else response.destroy();
      });
      request.pipe(outgoing);
    })().catch((error) => {
      if (!response.headersSent) denyRequest(response, 502, error.code || 'PROXY_ERROR');
      else response.destroy();
    });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  server.on('connect', (request, clientSocket, head) => {
    void (async () => {
      let target;
      try {
        target = new URL(`http://${request.url}`);
        if (target.username || target.password || target.pathname !== '/' ||
            !target.port || !['443'].includes(target.port)) {
          throw new CaptureError('UNSAFE_URL');
        }
        await resolvePublicHost(target.hostname, lookup);
      } catch (error) {
        clientSocket.end(
          `HTTP/1.1 403 Forbidden\r\nX-Codex-Capture-Block: ${error.code || 'UNSAFE_URL'}\r\nConnection: close\r\n\r\n`,
        );
        return;
      }

      const addresses = await resolvePublicHost(target.hostname, lookup);
      const selected = addresses.find(({ family: addressFamily }) => addressFamily === 4) || addresses[0];
      const upstream = net.connect({
        host: selected.address,
        family: selected.family,
        port: 443,
      });
      sockets.add(upstream);
      upstream.once('close', () => sockets.delete(upstream));
      upstream.setTimeout(NETWORK_TIMEOUT_MS, () => upstream.destroy());
      upstream.once('connect', () => {
        upstream.setTimeout(0);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        clientSocket.pipe(upstream);
        upstream.pipe(clientSocket);
      });
      upstream.once('error', () => {
        if (!clientSocket.destroyed) clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      });
    })().catch(() => {
      if (!clientSocket.destroyed) clientSocket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      for (const socket of sockets) socket.destroy();
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function acquireCaptureSlot() {
  if (activeCaptures < MAX_ACTIVE_CAPTURES) {
    activeCaptures++;
    return Promise.resolve();
  }
  if (captureQueue.length >= MAX_QUEUED_CAPTURES) {
    return Promise.reject(new CaptureError('BUSY'));
  }
  return new Promise((resolve) => captureQueue.push(resolve));
}

function releaseCaptureSlot() {
  const next = captureQueue.shift();
  if (next) next();
  else activeCaptures--;
}

async function getBrowser() {
  if (!browserPromise) {
    let chromium;
    try {
      ({ chromium } = require('playwright'));
    } catch (error) {
      throw new CaptureError('BROWSER_UNAVAILABLE', undefined, { cause: error });
    }

    browserPromise = chromium.launch({ headless: true }).then((browser) => {
      browser.once('disconnected', () => {
        browserPromise = null;
      });
      return browser;
    }).catch((error) => {
      browserPromise = null;
      throw new CaptureError('BROWSER_UNAVAILABLE', undefined, { cause: error });
    });
  }
  return browserPromise;
}

function installChromium() {
  let cliPath;
  try {
    cliPath = path.join(path.dirname(require.resolve('playwright')), 'cli.js');
  } catch (error) {
    return Promise.reject(new CaptureError('BROWSER_UNAVAILABLE', undefined, { cause: error }));
  }

  return new Promise((resolve, reject) => {
    console.log('[web-capture] Installing Playwright Chromium; this is only needed once per host environment.');
    const installer = spawn(process.execPath, [cliPath, 'install', 'chromium'], {
      stdio: 'inherit',
    });
    installer.once('error', (error) => {
      reject(new CaptureError('BROWSER_INSTALL_FAILED', undefined, { cause: error }));
    });
    installer.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new CaptureError('BROWSER_INSTALL_FAILED', `Playwright Chromium installer exited with code ${code}.`));
    });
  });
}

async function ensureChromiumInstalled({ chromium, install = installChromium } = {}) {
  if (!chromium) {
    try {
      ({ chromium } = require('playwright'));
    } catch (error) {
      throw new CaptureError('BROWSER_UNAVAILABLE', undefined, { cause: error });
    }
  }

  const executablePath = chromium.executablePath();
  try {
    await fs.access(executablePath);
    return false;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new CaptureError('BROWSER_INSTALL_FAILED', undefined, { cause: error });
    }
  }

  try {
    await install();
    await fs.access(executablePath);
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError('BROWSER_INSTALL_FAILED', undefined, { cause: error });
  }
  console.log('[web-capture] Playwright Chromium is ready.');
  return true;
}

async function createCapturePage() {
  const proxy = await createSafeProxy();
  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      proxy: { server: proxy.url, bypass: '<-loopback>' },
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    return { page, context, proxy };
  } catch (error) {
    await proxy.close();
    throw error;
  }
}

function throwForBlockedResponse(response) {
  if (response?.headers()['x-codex-capture-block']) {
    throw new CaptureError('UNSAFE_URL');
  }
}

async function captureScreenshot(value) {
  await acquireCaptureSlot();
  let context;
  let proxy;
  try {
    const url = await validateTarget(value);
    const capture = await createCapturePage();
    context = capture.context;
    proxy = capture.proxy;
    const page = capture.page;
    const response = await page.goto(url.href, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    throwForBlockedResponse(response);
    await page.waitForTimeout(1_000);

    const dimensions = await page.evaluate(() => ({
      width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
    }));
    if (dimensions.height > MAX_SCREENSHOT_HEIGHT) {
      throw new CaptureError('PAGE_TOO_LONG');
    }

    const image = await page.screenshot({
      type: 'jpeg',
      quality: 85,
      fullPage: true,
      animations: 'disabled',
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    if (image.length > MAX_SCREENSHOT_BYTES) throw new CaptureError('OUTPUT_TOO_LARGE');
    return image;
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    if (error?.name === 'TimeoutError' || error?.code === 'TIMEOUT') {
      throw new CaptureError('TIMEOUT', undefined, { cause: error });
    }
    throw new CaptureError('PAGE_UNAVAILABLE', undefined, { cause: error });
  } finally {
    try {
      await context?.close();
    } finally {
      try {
        await proxy?.close();
      } finally {
        releaseCaptureSlot();
      }
    }
  }
}

function getUserError(error, command) {
  const messages = {
    INVALID_URL: `Please provide a valid website URL.\nExample: .${command} https://example.com`,
    UNSAFE_URL: 'For safety, captures are limited to public websites on standard web ports. Local and private-network addresses are blocked.',
    DNS_ERROR: 'The website address could not be resolved. Check the URL or try again later.',
    TIMEOUT: 'The page took too long to load. Please try again later or use a lighter page.',
    BROWSER_UNAVAILABLE: 'Website capture is temporarily unavailable because the browser is not installed correctly. Please contact the bot administrator.',
    BROWSER_INSTALL_FAILED: 'The host could not install the browser required for website capture. Please contact the bot administrator.',
    PAGE_TOO_LONG: 'This page is too long to fit in one screenshot. Try a shorter page.',
    OUTPUT_TOO_LARGE: 'The capture is too large to send in WhatsApp. Try a simpler page.',
    BUSY: 'The capture service is busy right now. Please try again in a moment.',
    PAGE_UNAVAILABLE: 'We could not capture that page. It may be unavailable or may block automated browsers.',
  };
  if (error instanceof CaptureError && messages[error.code]) return messages[error.code];
  return messages.PAGE_UNAVAILABLE;
}

module.exports = {
  CaptureError,
  captureScreenshot,
  ensureChromiumInstalled,
  getUserError,
  isPublicAddress,
  normalizeTargetUrl,
  resolvePublicHost,
  validateTarget,
};
