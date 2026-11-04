'use strict';

/**
 * YouTube → MP3 through web converters (no yt-dlp, no YouTube login).
 *
 * yt-dlp talks to YouTube directly, so on many hosting panels YouTube answers
 * with "sign in to confirm you're not a bot". These converters fetch the audio
 * from their own servers instead, which is why they keep working there.
 *
 * Providers are tried in order, first success wins:
 *   1. savetube   2. cnvmp3   3. savenow   4. RapidAPI (only if RAPIDAPI_KEYS is set)
 *
 * Optional panel variables:
 *   SAVENOW_API_KEY   override the savenow key
 *   RAPIDAPI_KEYS     comma-separated RapidAPI keys for the youtube-mp36 backup
 */

const crypto = require('crypto');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const MAX_BYTES = 100 * 1024 * 1024;
const MIN_BYTES = 10 * 1024;
const SAVETUBE_KEY = 'C5D58EF67A7584E4A29F6C35BBC4EB12';   // public key used by the savetube site
const SAVENOW_KEY = process.env.SAVENOW_API_KEY || 'dfcb6d76f2f6a9894gjkege8a4ab232222';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function http(url, { method = 'GET', headers = {}, body, timeout = 30000 } = {}) {
    const res = await fetch(url, {
        method,
        headers: { accept: '*/*', 'user-agent': UA, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
        redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return res;
}

const getJson = async (url, opts) => (await http(url, opts)).json();

async function getAudioBuffer(url, headers = {}) {
    const res = await http(url, { headers, timeout: 120000 });
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('audio file too large');
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < MIN_BYTES) throw new Error('downloaded file is too small to be audio');
    if (buffer.length > MAX_BYTES) throw new Error('audio file too large');
    if (buffer[0] === 0x3c || buffer[0] === 0x7b) throw new Error('provider returned a web page instead of audio');
    return buffer;
}

function extractYouTubeId(input) {
    if (!input) return null;
    const patterns = [
        /youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/,
        /youtube\.com\/shorts\/([\w-]{11})/,
        /youtube\.com\/embed\/([\w-]{11})/,
        /youtu\.be\/([\w-]{11})/,
    ];
    for (const re of patterns) {
        const hit = String(input).match(re);
        if (hit) return hit[1];
    }
    return /^[\w-]{11}$/.test(input) ? input : null;
}

// ─── 1. savetube ────────────────────────────────────────────────────────────
function decryptSaveTube(base64) {
    const raw = Buffer.from(base64, 'base64');
    const iv = raw.subarray(0, 16);
    const data = raw.subarray(16);
    const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(SAVETUBE_KEY, 'hex'), iv);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}

async function savetube(videoId) {
    const watch = `https://www.youtube.com/watch?v=${videoId}`;
    const headers = { 'content-type': 'application/json', origin: 'https://yt.savetube.me', referer: 'https://yt.savetube.me/' };

    const { cdn } = await getJson('https://media.savetube.vip/api/random-cdn');
    if (!cdn) throw new Error('Missing CDN host');

    const info = await getJson(`https://${cdn}/v2/info`, { method: 'POST', headers, body: { url: watch } });
    const meta = decryptSaveTube(info.data);

    const dl = await getJson(`https://${cdn}/download`, {
        method: 'POST',
        headers,
        body: { downloadType: 'audio', quality: 128, key: meta.key },
    });
    const link = dl?.data?.downloadUrl;
    if (!link) throw new Error('Missing direct download URL');

    return { provider: 'savetube', buffer: await getAudioBuffer(link), title: meta.title };
}

// ─── 2. cnvmp3 ──────────────────────────────────────────────────────────────
async function cnvmp3(videoId) {
    const watch = `https://www.youtube.com/watch?v=${videoId}`;
    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://cnvmp3.com',
        Referer: 'https://cnvmp3.com/v54',
    };

    const meta = await getJson('https://cnvmp3.com/get_video_data.php', { method: 'POST', headers, body: { url: watch, token: '1234' } });
    if (!meta.success || !meta.title) throw new Error(meta.error || 'meta failed');

    const dl = await getJson('https://cnvmp3.com/download_video_ucep.php', {
        method: 'POST',
        headers,
        body: { url: watch, quality: 4, title: meta.title, formatValue: 1 },
    });
    if (!dl.success || !dl.download_link) throw new Error(dl.error || 'missing download link');

    return { provider: 'cnvmp3', buffer: await getAudioBuffer(dl.download_link), title: meta.title };
}

// ─── 3. savenow ─────────────────────────────────────────────────────────────
async function savenow(videoId) {
    const watch = `https://www.youtube.com/watch?v=${videoId}`;
    const headers = { referer: 'https://mp3juice3.ninja/' };

    const init = await getJson(
        `https://p.savenow.to/ajax/download.php?copyright=0&format=mp3&url=${encodeURIComponent(watch)}&api=${SAVENOW_KEY}`,
        { headers },
    );
    if (!init.success) throw new Error('provider returned unsuccessful init');

    let link = init.downloadUrl || init.download_url;
    if (!link) {
        if (!init.id) throw new Error('missing conversion id');
        for (let i = 0; i < 20 && !link; i++) {
            const progress = await getJson(`https://p.savenow.to/ajax/progress.php?id=${encodeURIComponent(init.id)}`, { headers });
            link = progress.downloadUrl || progress.download_url || progress.url;
            if (!link) await sleep(2000);
        }
        if (!link) throw new Error('timed out waiting for final link');
    }

    return { provider: 'savenow', buffer: await getAudioBuffer(link), title: init.title };
}

// ─── 4. RapidAPI (optional) ─────────────────────────────────────────────────
async function rapidapi(videoId) {
    const keys = String(process.env.RAPIDAPI_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    if (!keys.length) throw new Error('no RAPIDAPI_KEYS configured');

    let lastError;
    for (const key of keys) {
        try {
            for (let attempt = 0; attempt < 5; attempt++) {
                const data = await getJson(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
                    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com' },
                });
                if (data?.status === 'processing') { await sleep(3000); continue; }
                if (data?.status !== 'ok' || !data?.link) throw new Error('provider returned no link');
                return { provider: 'rapidapi', buffer: await getAudioBuffer(data.link), title: data.title };
            }
            throw new Error('still processing');
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError;
}

const PROVIDERS = [savetube, cnvmp3, savenow, rapidapi];

/**
 * Resolves with { buffer, title, provider } from the first provider that works.
 * Rejects with one error that lists why every provider failed.
 */
async function getYouTubeAudio(videoOrUrl) {
    const videoId = extractYouTubeId(videoOrUrl);
    if (!videoId) throw new Error('Invalid YouTube URL');

    const failures = [];
    for (const provider of PROVIDERS) {
        try {
            const result = await provider(videoId);
            console.log(`[ytaudio] ${result.provider} ok (${(result.buffer.length / 1048576).toFixed(1)} MB)`);
            return result;
        } catch (err) {
            failures.push(`${provider.name}: ${err.message}`);
            console.warn(`[ytaudio] ${provider.name} failed: ${err.message}`);
        }
    }
    throw new Error(`All audio providers failed (${failures.join(' | ')})`);
}

module.exports = { getYouTubeAudio, extractYouTubeId, decryptSaveTube };
