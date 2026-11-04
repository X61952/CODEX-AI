'use strict';

/**
 * Shared glue between the bot and the `social-dl` package.
 *
 * social-dl extracts media straight from the platform CDNs (bundled yt-dlp),
 * so none of the old third-party download APIs are needed any more.
 * Supported by the package: YouTube (video + audio), TikTok, Facebook,
 * Instagram, Twitter/X, Pinterest, CapCut.
 *
 * Every download command goes through this file, so a package upgrade or a
 * behaviour change only ever needs to be made here.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const axios = require('axios');
const { createTempFilePath, getTempDir } = require('../utils/tempManager');
const { quotedUrl } = require('./quotedUrl');

// ─── ffmpeg on PATH (yt-dlp needs it for mp3 extraction / stream merging) ───
let FFMPEG = null;
try {
    FFMPEG = require('ffmpeg-static');
    if (FFMPEG) {
        const dir = path.dirname(FFMPEG);
        const parts = (process.env.PATH || '').split(path.delimiter);
        if (!parts.includes(dir)) process.env.PATH = [dir, ...parts].join(path.delimiter);
    }
} catch { /* ffmpeg-static optional */ }

// ─── Tunables (all overridable with panel variables) ────────────────────────
const MAX_PARALLEL      = Number(process.env.DL_MAX_PARALLEL) || 3;
const MAX_VIDEO_SECONDS = (Number(process.env.DL_MAX_VIDEO_MINUTES) || 10) * 60;
const MAX_FILE_BYTES    = 300 * 1024 * 1024;   // refuse anything bigger
const VIDEO_INLINE_MAX  = 64  * 1024 * 1024;   // above this → sent as a document
const BUFFER_MAX        = 50  * 1024 * 1024;   // above this → streamed from disk
const DOWNLOAD_TIMEOUT  = 4 * 60 * 1000;
const SLOW_TIMEOUT      = 10 * 60 * 1000;   // short-drama HLS episodes

// ─── Platforms the package supports (social-dl 1.4.x) ──────────────────────
// type: 'video'  → video, "mp3" flag allowed
//       'music'  → always sent as audio
//       'visual' → video/images only, no audio-only mode
// tokens: matched against the link's hostname, so regional domains and share
//         subdomains (e.g. sharet.dramabox.com) are recognised automatically.
const PLATFORMS = {
    youtube:    { label: 'YouTube',      type: 'video',  example: 'https://youtu.be/BJs3DBrMTSc' },
    tiktok:     { label: 'TikTok',       type: 'video',  images: true, example: 'https://www.tiktok.com/@user/video/123' },
    facebook:   { label: 'Facebook',     type: 'video',  example: 'https://www.facebook.com/reel/1234567890/' },
    instagram:  { label: 'Instagram',    type: 'video',  example: 'https://www.instagram.com/reel/CODE/' },
    twitter:    { label: 'Twitter/X',    type: 'video',  example: 'https://x.com/user/status/123' },
    pinterest:  { label: 'Pinterest',    type: 'visual', images: true, example: 'https://www.pinterest.com/pin/1234567890/' },
    capcut:     { label: 'CapCut',       type: 'visual', example: 'https://www.capcut.com/template-detail/1234567890' },
    rednote:    { label: 'RedNote',      type: 'visual', images: true, example: 'https://www.xiaohongshu.com/explore/ID' },
    threads:    { label: 'Threads',      type: 'visual', images: true, example: 'https://www.threads.com/@user/post/CODE' },
    spotify:    { label: 'Spotify',      type: 'music',  example: 'https://open.spotify.com/track/ID' },
    applemusic: { label: 'Apple Music',  type: 'music',  example: 'https://music.apple.com/us/album/name/ID?i=ID' },
    audiomack:  { label: 'Audiomack',    type: 'music',  example: 'https://audiomack.com/artist/song/name' },
    dramabox:   { label: 'DramaBox',     type: 'visual', slow: true, example: 'https://www.dramabox.com/...' },
    dramafren:  { label: 'DramaFren',    type: 'visual', slow: true, example: 'https://dramafren.com/...' },
    goodshort:  { label: 'GoodShort',    type: 'visual', slow: true, example: 'https://www.goodshort.com/...' },
    flextv:     { label: 'FlexTV',       type: 'visual', slow: true, example: 'https://www.flextv.cc/...' },
    moboreels:  { label: 'MoboReels',    type: 'visual', slow: true, example: 'https://www.moboreels.com/...' },
    reelshort:  { label: 'ReelShort',    type: 'visual', slow: true, example: 'https://www.reelshort.com/...' },
    shortmax:   { label: 'ShortMax',     type: 'visual', slow: true, example: 'https://www.shortmax.com/...' },
    flickreels: { label: 'FlickReels',   type: 'visual', slow: true, example: 'https://www.flickreels.net/...' },
    anydrama:   { label: 'AnyDrama',     type: 'visual', slow: true, example: 'https://anydrama.com/...' },
    savetube:   { label: 'SaveTube',     type: 'video',  example: 'https://savetube.me/...' },
};

// Exact-domain platforms
const HOSTS = {
    youtube:    ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
    tiktok:     ['tiktok.com'],
    facebook:   ['facebook.com', 'fb.watch', 'fb.com', 'fb.me'],
    instagram:  ['instagram.com', 'instagr.am'],
    twitter:    ['twitter.com', 'x.com', 't.co'],
    capcut:     ['capcut.com'],
    rednote:    ['xiaohongshu.com', 'xhslink.com', 'rednote.com'],
    threads:    ['threads.net', 'threads.com'],
    spotify:    ['spotify.com', 'spotify.link'],
    applemusic: ['music.apple.com', 'itunes.apple.com'],
    audiomack:  ['audiomack.com'],
};

// Brand-token platforms (match anywhere in the hostname)
const HOST_TOKENS = {
    dramabox: 'dramabox',
    dramafren: 'dramafren',
    goodshort: 'goodshort',
    flextv: 'flextv',
    moboreels: 'moboreels',
    reelshort: 'reelshort',
    shortmax: 'shortmax',
    flickreels: 'flickreels',
    anydrama: 'anydrama',
    savetube: 'savetube',
};

function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); }
    catch { return ''; }
}

function detectPlatform(url) {
    const host = hostOf(url);
    if (!host) return null;
    if (/(^|\.)pinterest\.[a-z.]+$/.test(host) || host === 'pin.it') return 'pinterest';
    for (const [name, domains] of Object.entries(HOSTS)) {
        if (domains.some(d => host === d || host.endsWith('.' + d))) return name;
    }
    for (const [name, token] of Object.entries(HOST_TOKENS)) {
        if (host.includes(token)) return name;
    }
    return null;
}

function platformListText() {
    return Object.values(PLATFORMS).map(p => `• ${p.label}`).join('\n');
}

// ─── Input parsing ──────────────────────────────────────────────────────────
const AUDIO_FLAGS = new Set(['mp3', 'audio', '-a', '--mp3', '--audio']);
const LANG_FLAGS = new Set(['--lan', '--lang', '--language']);

/**
 * Pulls the link and options out of the command args.
 * Options are read from the command text only (never from a quoted message),
 * the link may also come from the message being replied to.
 *   --quality 720p | 720p | --best      video quality
 *   --lan en | --lang en                subtitle/dub language (short dramas, sent as `lan`)
 *   mp3 | --mp3                         audio only
 *   --no-watermark                      watermark-free variant when supported
 */
function parseInput(m, args = []) {
    const list = (Array.isArray(args) ? args : []).map(a => String(a));
    let url = list.find(a => /^https?:\/\//i.test(a)) || '';
    if (!url) url = quotedUrl(m) || '';

    let audioOnly = false;
    let quality;
    let lan;
    let noWatermark = false;

    for (let i = 0; i < list.length; i++) {
        const a = list[i].toLowerCase();
        if (AUDIO_FLAGS.has(a)) audioOnly = true;
        else if (a === '--best') quality = 'best';
        else if (a === '--no-watermark' || a === '--nowm') noWatermark = true;
        else if (a === '--quality' || a === '-q') {
            const v = (list[i + 1] || '').toLowerCase();
            if (/^(\d{3,4}p?|best)$/.test(v)) { quality = /^\d+$/.test(v) ? `${v}p` : v; i++; }
        } else if (LANG_FLAGS.has(a)) {
            const v = (list[i + 1] || '').trim();
            if (v && !v.startsWith('-')) { lan = v; i++; }
        } else if (/^(\d{3,4}p|best)$/.test(a)) quality = a;
    }
    return { url: url.replace(/[)\]>.,]+$/, ''), audioOnly, quality, lan, noWatermark };
}

async function expandShortUrl(url) {
    const host = hostOf(url);
    if (host !== 't.co' && host !== 'pin.it') return url;
    try {
        const res = await axios.get(url, {
            maxRedirects: 5,
            timeout: 12000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
            validateStatus: () => true,
        });
        return res.request?.res?.responseUrl || url;
    } catch {
        return url;
    }
}

// ─── Package loader (social-dl is ESM, the bot is CommonJS) ─────────────────
let modPromise = null;
function loadPackage() {
    if (!modPromise) {
        modPromise = import('social-dl').catch(err => {
            modPromise = null;
            throw err;
        });
    }
    return modPromise;
}

function cookieOptions() {
    const opts = {};
    if (process.env.SOCIAL_DL_COOKIES && fs.existsSync(process.env.SOCIAL_DL_COOKIES)) {
        opts.cookiesPath = process.env.SOCIAL_DL_COOKIES;
    }
    if (process.env.SOCIAL_DL_COOKIES_FROM_BROWSER) {
        opts.cookiesFromBrowser = process.env.SOCIAL_DL_COOKIES_FROM_BROWSER;
    }
    return opts;
}

// ─── Small concurrency limiter so the panel is never flooded with yt-dlp ────
let active = 0;
const waiting = [];
function acquire() {
    return new Promise(resolve => {
        if (active < MAX_PARALLEL) { active++; resolve(); }
        else waiting.push(resolve);
    });
}
function release() {
    const next = waiting.shift();
    if (next) next();
    else active = Math.max(0, active - 1);
}

function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Download timed out')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ─── File sniffing (so we always send the right WhatsApp message type) ──────
function sniff(buf) {
    if (!buf || buf.length < 12) return null;
    const at = (a, b) => buf.toString('latin1', a, b);
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' };
    if (buf[0] === 0x89 && at(1, 4) === 'PNG') return { kind: 'image', mime: 'image/png', ext: 'png' };
    if (at(0, 3) === 'GIF') return { kind: 'image', mime: 'image/gif', ext: 'gif' };
    if (at(0, 4) === 'RIFF' && at(8, 12) === 'WEBP') return { kind: 'image', mime: 'image/webp', ext: 'webp' };
    if (at(4, 8) === 'ftyp') {
        const brand = at(8, 12);
        if (/^(avif|avis)$/.test(brand)) return { kind: 'image', mime: 'image/avif', ext: 'avif' };
        if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1)$/.test(brand)) return { kind: 'image', mime: 'image/heic', ext: 'heic' };
        if (brand === 'M4A ' || brand === 'M4B ') return { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };
        return { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
    }
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'video', mime: 'video/webm', ext: 'webm' };
    if (at(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
    if (at(0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' };
    if (buf[0] === 0x3c || buf[0] === 0x7b) return { kind: 'invalid' };   // '<' or '{' = HTML/JSON error page
    return null;
}

function sniffFile(file) {
    try {
        const fd = fs.openSync(file, 'r');
        const head = Buffer.alloc(16);
        fs.readSync(fd, head, 0, 16, 0);
        fs.closeSync(fd);
        return sniff(head);
    } catch {
        return null;
    }
}

function convertToMp3(src) {
    return new Promise(resolve => {
        if (!FFMPEG) return resolve(null);
        const out = createTempFilePath('sdl_conv', 'mp3');
        execFile(
            FFMPEG,
            ['-y', '-i', src, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', out],
            { timeout: 120000, maxBuffer: 20 * 1024 * 1024 },
            err => {
                if (err || !fs.existsSync(out) || fs.statSync(out).size < 1024) {
                    try { fs.unlinkSync(out); } catch {}
                    return resolve(null);
                }
                resolve(out);
            }
        );
    });
}

// ─── Core download ──────────────────────────────────────────────────────────
function codedError(code, message) {
    return Object.assign(new Error(message || code), { code });
}

function pickInfo(obj) {
    const d = obj?.data || obj?.result || obj?.info || obj || {};
    if (!d || typeof d !== 'object') return {};
    return {
        title: d.title || d.name || '',
        author: d.author || d.artist || d.uploader || d.channel || d.username || '',
        album: d.album || '',
        duration: Number(d.duration || d.durationSec || d.duration_seconds) || 0,
        thumbnail: d.thumbnail || d.thumb || '',
        isPreviewFallback: d.isPreviewFallback === true,
    };
}

const nonEmpty = obj => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v));

async function withSlot(fn) {
    await acquire();
    try { return await fn(); }
    finally { release(); }
}

/** A real, non-empty regular file. Directories are rejected (this was the EISDIR bug). */
function isFile(f) {
    try {
        const st = fs.statSync(f);
        return st.isFile() && st.size > 0;
    } catch {
        return false;
    }
}

function findSavedFile(dest, ret) {
    const candidates = [dest];
    if (typeof ret === 'string') candidates.push(ret);
    for (const k of ['path', 'file', 'filePath', 'filename', 'destination', 'output']) {
        if (ret && typeof ret[k] === 'string') candidates.push(ret[k]);
    }
    for (const c of candidates) if (isFile(c)) return c;

    // yt-dlp sometimes appends/changes the extension
    const base = path.basename(dest, path.extname(dest));
    try {
        const dir = getTempDir();
        const hit = fs.readdirSync(dir)
            .filter(f => f.startsWith(base))
            .map(f => path.join(dir, f))
            .find(isFile);
        if (hit) return hit;
    } catch { /* ignore */ }
    return null;
}

function cleanupFor(dest, extra = []) {
    const base = path.basename(dest, path.extname(dest));
    try {
        const dir = getTempDir();
        for (const f of fs.readdirSync(dir)) {
            if (!f.startsWith(base)) continue;
            const full = path.join(dir, f);
            try { if (fs.statSync(full).isFile()) fs.unlinkSync(full); } catch {}
        }
    } catch { /* ignore */ }
    for (const f of extra) { try { fs.unlinkSync(f); } catch {} }
}

/**
 * Runs `saveFn(destPath)` (any social-dl *Save function or a plain HTTP download),
 * validates what landed on disk and returns { file, size, type, info, cleanup }.
 */
async function saveToFile(saveFn, { ext = 'mp4', audio = false, timeoutMs = DOWNLOAD_TIMEOUT } = {}) {
    const dest = createTempFilePath('sdl', ext);
    const extra = [];
    try {
        const ret = await withTimeout(Promise.resolve(saveFn(dest)), timeoutMs);
        let file = findSavedFile(dest, ret);
        if (!file) throw codedError('EMPTY_DOWNLOAD', 'Nothing was downloaded');

        let type = sniffFile(file);
        if (type?.kind === 'invalid') throw codedError('MEDIA_TYPE_MISMATCH', 'The server returned a web page instead of media');

        if (audio && type && type.kind !== 'audio') type = { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };

        // Prefer a real mp3 for audio requests when the source gave us m4a/ogg.
        if (audio && type?.ext !== 'mp3') {
            const mp3 = await convertToMp3(file);
            if (mp3) {
                extra.push(mp3);
                file = mp3;
                type = { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
            }
        }

        const size = fs.statSync(file).size;
        if (size > MAX_FILE_BYTES) {
            throw codedError('TOO_LARGE', `File is too large to send (${(size / 1048576).toFixed(0)} MB, limit ${MAX_FILE_BYTES / 1048576} MB)`);
        }

        return {
            file,
            size,
            type: type || (audio
                ? { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' }
                : { kind: 'video', mime: 'video/mp4', ext: 'mp4' }),
            info: pickInfo(ret),
            cleanup: () => cleanupFor(dest, extra),
        };
    } catch (err) {
        cleanupFor(dest, extra);
        throw err;
    }
}

// ─── Plain HTTP helpers (Apple preview, Audiomack, photo galleries) ─────────
const MAX_HTTP_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 10;
const MAX_ALBUM_TRACKS = 20;

async function downloadUrlToFile(url, file, referer) {
    let parsed;
    try { parsed = new URL(String(url)); } catch { throw codedError('INVALID_MEDIA_URL'); }
    if (!/^https?:$/.test(parsed.protocol)) throw codedError('INVALID_MEDIA_URL');
    const response = await fetch(parsed, {
        headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0', ...(referer ? { Referer: referer } : {}) },
        signal: AbortSignal.timeout(30_000),
        redirect: 'follow',
    });
    if (!response.ok) throw codedError(`MEDIA_HTTP_${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_HTTP_BYTES) throw codedError('MEDIA_TOO_LARGE');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_HTTP_BYTES) throw codedError('INVALID_MEDIA_SIZE');
    fs.writeFileSync(file, buffer);
    return { contentType: response.headers.get('content-type') || null };
}

async function downloadImage(url, referer) {
    let parsed;
    try { parsed = new URL(String(url)); } catch { throw codedError('INVALID_IMAGE_URL'); }
    if (!/^https?:$/.test(parsed.protocol)) throw codedError('INVALID_IMAGE_URL');
    const response = await fetch(parsed, {
        headers: { Accept: 'image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.5', 'User-Agent': 'Mozilla/5.0', ...(referer ? { Referer: referer } : {}) },
        signal: AbortSignal.timeout(30_000),
        redirect: 'follow',
    });
    if (!response.ok) throw codedError(`IMAGE_HTTP_${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) throw codedError('IMAGE_TOO_LARGE');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw codedError('INVALID_IMAGE_SIZE');
    const detected = sniff(buffer);
    if (detected?.kind !== 'image') throw codedError('MEDIA_TYPE_MISMATCH', 'The server returned something that is not an image');
    const normalized = await toWhatsAppImage(buffer, detected);
    return { ...normalized, url: parsed.href };
}

/**
 * WhatsApp only renders JPEG / PNG / WebP reliably. TikTok and others often serve
 * AVIF / HEIC, which show up as blank "broken" images, so anything else is
 * converted to JPEG with sharp (already a dependency of the bot).
 */
async function toWhatsAppImage(buffer, detected) {
    if (detected.mime === 'image/jpeg' || detected.mime === 'image/png') {
        return { buffer, mimetype: detected.mime };
    }
    try {
        const sharp = require('sharp');
        const out = await sharp(buffer).rotate().jpeg({ quality: 90 }).toBuffer();
        if (out.length > 1024) return { buffer: out, mimetype: 'image/jpeg' };
    } catch (err) {
        console.warn('[social-dl image convert failed]', detected.mime, err.message);
    }
    if (detected.mime === 'image/webp' || detected.mime === 'image/gif') return { buffer, mimetype: detected.mime };
    throw codedError('IMAGE_FORMAT_UNSUPPORTED', `Cannot convert ${detected.mime} to a WhatsApp-friendly image`);
}

function imageUrlsFromInfo(info) {
    const direct = Array.isArray(info?.images) ? info.images : [];
    const fromFormats = Array.isArray(info?.formats)
        ? info.formats.filter(f => /^(?:jpe?g|png|webp|gif|avif)$/i.test(f?.type || '')).map(f => f.url)
  : [];
    const values = [...direct, ...fromFormats].map(i => (typeof i === 'string' ? i : i?.url)).filter(Boolean);
    return [...new Set(values)].slice(0, MAX_GALLERY_IMAGES);
}

async function resolvePhotos(info, url) {
    const urls = imageUrlsFromInfo(info);
    if (!urls.length) throw codedError('NO_IMAGES', 'No images found in that post');
    const results = await Promise.all(urls.map(async u => {
        try { return await downloadImage(u, url); }
        catch (err) { console.warn('[social-dl image skipped]', err.message); return null; }
    }));
    const images = results.filter(Boolean);
    if (!images.length) throw codedError('NO_DOWNLOADABLE_IMAGES', 'The images could not be downloaded');
    return { kind: 'photos', images, info: pickInfo(info), total: urls.length };
}

// ─── Audiomack albums ───────────────────────────────────────────────────────
function isAudiomackAlbumUrl(url) {
    try { return /\/(?:album|playlist)\//i.test(new URL(String(url)).pathname); } catch { return false; }
}

function extractAudiomackTrackUrls(html, albumUrl) {
    const urls = [];
    let albumSlug = '';
    try { albumSlug = new URL(String(albumUrl)).pathname.split('/').filter(Boolean).pop()?.toLowerCase() || ''; } catch {}
    const add = value => {
        try {
            const parsed = new URL(String(value).replace(/\\u0026/g, '&').replace(/\\\//g, '/'), albumUrl);
            if (!/^https?:$/.test(parsed.protocol) || !/audiomack\.com$/i.test(parsed.hostname.replace(/^www\./i, ''))) return;
            if (!/\/song\//i.test(parsed.pathname)) return;
            if (albumSlug && parsed.pathname.split('/').filter(Boolean).pop()?.toLowerCase() === albumSlug) return;
            parsed.hash = '';
            if (!urls.includes(parsed.href)) urls.push(parsed.href);
        } catch {}
    };
    for (const match of String(html || '').matchAll(/https?:\/\/(?:www\.)?audiomack\.com\/[^"'\\\s]+\/song\/[^"'\\\s]+|\/[^"'\\\s]+\/song\/[^"'\\\s]+/gi)) add(match[0]);
    return urls.slice(0, MAX_ALBUM_TRACKS);
}

// ─── Per-platform resolvers (calls mirror the package's own API) ────────────
function need(pkg, fn) {
    if (typeof pkg[fn] !== 'function') {
        throw codedError('PACKAGE_OUTDATED', `social-dl is missing ${fn}(). Update it with: npm i social-dl@latest`);
    }
    return pkg[fn].bind(pkg);
}

function outputExt(info, audio) {
    if (audio) return info?.downloadExtension || 'mp3';
    const e = String(info?.downloadExtension || 'mp4').toLowerCase();
    return ['m3u8', 'mpd'].includes(e) ? 'mp4' : e;   // HLS/DASH are muxed to mp4
}

async function resolveUniversal(pkg, url, platform, opts) {
    const { audioOnly = false, noWatermark = false, quality, lan, timeoutMs } = opts;
    const shared = { ...cookieOptions() };
    if (quality) shared.quality = quality;
    if (lan) shared.lan = lan;

    let raw = null;
    let info = {};
    if (platform !== 'youtube') {
        raw = await withTimeout(need(pkg, 'universalDl')(url, { ...shared, audioOnly, noWatermark }), 90_000);
        if (raw?.mediaType === 'photo' || imageUrlsFromInfo(raw).length) return resolvePhotos(raw, url);
        info = pickInfo(raw);
    }

    const isAudio = audioOnly || raw?.mediaType === 'audio';
    const ext = audioOnly ? 'mp3' : outputExt(raw, isAudio);
    const saveOpts = platform === 'youtube'
        ? { ...shared, audioOnly: isAudio }
        : { ...shared, audioOnly: isAudio, noWatermark };

    const media = await saveToFile(
        dest => need(pkg, 'universalSave')(url, dest, saveOpts),
        { ext, audio: isAudio, timeoutMs },
    );
    media.info = { ...info, ...nonEmpty(media.info) };
    return { kind: 'file', media };
}

async function resolveNamed(pkg, url, dlName, saveName, opts) {
    const info = await withTimeout(need(pkg, dlName)(url, cookieOptions()), 90_000);
    if (info?.mediaType === 'photo' || imageUrlsFromInfo(info).length) return resolvePhotos(info, url);
    const media = await saveToFile(
        dest => need(pkg, saveName)(url, dest, cookieOptions()),
        { ext: 'mp4', audio: false, timeoutMs: opts.timeoutMs },
    );
    media.info = { ...pickInfo(info), ...nonEmpty(media.info) };
    return { kind: 'file', media };
}

async function resolveSpotify(pkg, url, opts) {
    const info = await withTimeout(need(pkg, 'spotifyDl')(url), 90_000);
    if (info?.type && info.type !== 'track') throw codedError('NOT_A_TRACK', 'Use a Spotify track link to download one song.');
    const media = await saveToFile(
        dest => need(pkg, 'spotifySaveMatched')(info, dest),
        { ext: 'mp3', audio: true, timeoutMs: opts.timeoutMs },
    );
    media.info = { ...pickInfo(info), ...nonEmpty(media.info) };
    return { kind: 'file', media };
}

async function resolveAppleMusic(pkg, url, opts) {
    const info = await withTimeout(need(pkg, 'applemusicDl')(url), 90_000);
    const preview = info?.isPreviewFallback === true;
    const media = await saveToFile(
        dest => (preview
            ? downloadUrlToFile(info.previewUrl, dest, 'https://music.apple.com/')
            : need(pkg, 'saveMatchedAudio')(info, dest)),
        { ext: preview ? 'm4a' : 'mp3', audio: true, timeoutMs: opts.timeoutMs },
    );
    media.info = { ...pickInfo(info), ...nonEmpty(media.info), isPreviewFallback: preview };
    return { kind: 'file', media };
}

async function resolveAudiomackTrack(pkg, url, opts) {
    const info = await withTimeout(need(pkg, 'audiomackDl')(url), 90_000);
    const format = info?.formats?.find(f => f?.url && /^audio\//i.test(f.contentType || '')) || info?.formats?.[0];
    if (!format?.url) throw codedError('AUDIOMACK_AUDIO_NOT_FOUND', 'No audio stream found for that Audiomack link');
    const media = await saveToFile(
        dest => downloadUrlToFile(format.url, dest, url),
        { ext: info.downloadExtension || 'm4a', audio: true, timeoutMs: opts.timeoutMs },
    );
    media.info = { ...pickInfo(info), ...nonEmpty(media.info) };
    return { kind: 'file', media };
}

async function resolveAudiomack(pkg, url, opts) {
    if (!isAudiomackAlbumUrl(url)) return resolveAudiomackTrack(pkg, url, opts);

    const response = await fetch(url, {
        headers: { Accept: 'text/html,application/xhtml+xml', Referer: 'https://audiomack.com/' },
        signal: AbortSignal.timeout(30_000),
        redirect: 'follow',
    });
    if (!response.ok) throw codedError(`ALBUM_HTTP_${response.status}`, `Audiomack album page returned ${response.status}`);
    const trackUrls = extractAudiomackTrackUrls(await response.text(), url);
    if (!trackUrls.length) throw codedError('ALBUM_TRACKS_NOT_FOUND', 'No tracks found on that Audiomack album');

    const tracks = [];
    let failed = 0;
    try {
        for (const trackUrl of trackUrls) {
            try { tracks.push((await resolveAudiomackTrack(pkg, trackUrl, opts)).media); }
            catch (err) { failed++; console.warn('[social-dl album track skipped]', err.message); }
        }
    } catch (err) {
        tracks.forEach(t => t.cleanup());
        throw err;
    }
    if (!tracks.length) throw codedError('ALBUM_NO_DOWNLOADABLE_TRACKS', 'None of the album tracks could be downloaded');
    return { kind: 'album', tracks, failed, total: trackUrls.length, info: {} };
}

/**
 * Downloads `url` through social-dl.
 * Resolves with one of:
 *   { kind: 'file',   media }           video / audio / single image on disk
 *   { kind: 'photos', images, info }    photo carousel (buffers)
 *   { kind: 'album',  tracks, failed }  Audiomack album
 */
async function resolveMedia(url, platform = detectPlatform(url), opts = {}) {
    return withSlot(async () => {
        const pkg = await loadPackage();
        const audioOnly = opts.audioOnly === true;
        switch (platform) {
            case 'spotify':    return resolveSpotify(pkg, url, opts);
            case 'applemusic': return resolveAppleMusic(pkg, url, opts);
            case 'audiomack':  return resolveAudiomack(pkg, url, opts);
            case 'instagram':
                if (!audioOnly && !opts.quality && typeof pkg.instagramDl === 'function' && typeof pkg.instagramSave === 'function') {
                    return resolveNamed(pkg, url, 'instagramDl', 'instagramSave', opts);
                }
                break;
            case 'facebook':
                if (!audioOnly && !opts.quality && typeof pkg.facebookDl === 'function' && typeof pkg.facebookSave === 'function') {
                    return resolveNamed(pkg, url, 'facebookDl', 'facebookSave', opts);
                }
                break;
            default:
        }
        return resolveUniversal(pkg, url, platform, opts);
    });
}

/** Back-compat: single downloaded file (used by .play and other YouTube callers). */
async function fetchMedia(url, opts = {}) {
    const result = await resolveMedia(url, opts.platform || detectPlatform(url) || 'youtube', opts);
    if (result.kind !== 'file') {
        throw codedError('NOT_A_FILE', 'That link is a photo post or album, not a single file');
    }
    return result.media;
}

/** Metadata only (no file written). Never throws. */
async function getInfo(url, opts = {}) {
    try {
        const pkg = await loadPackage();
        const res = await withTimeout(pkg.universalDl(url, { ...cookieOptions(), ...opts }), 60_000);
        return pickInfo(res);
    } catch {
        return {};
    }
}

// ─── Sending ────────────────────────────────────────────────────────────────
function safeName(text, fallback = 'media') {
    const s = String(text || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return s || fallback;
}

function buildCaption(platformKey, info = {}) {
    const lines = [];
    if (info.title) lines.push(`*${info.title}*`);
    if (info.author) lines.push(info.author);
    if (info.album) lines.push(info.album);
    if (info.isPreviewFallback) lines.push('_Only a 30-second preview was available._');
    if (!lines.length) lines.push(PLATFORMS[platformKey]?.label || 'Download');
    return lines.join('\n');
}

async function sendMedia(bot, m, media, { caption = '', name = 'media' } = {}) {
    const sock = bot?.sock || bot;
    const payload = media.size <= BUFFER_MAX ? fs.readFileSync(media.file) : { url: media.file };
    const opts = { quoted: m };
    const { kind, mime, ext } = media.type;
    const fileName = `${safeName(name)}.${ext}`;

    if (kind === 'audio') {
        return sock.sendMessage(m.chat, { audio: payload, mimetype: mime, fileName, ptt: false }, opts);
    }
    if (kind === 'image') {
        return sock.sendMessage(m.chat, { image: payload, caption }, opts);
    }
    if (kind === 'video' && mime === 'video/mp4' && media.size <= VIDEO_INLINE_MAX) {
        return sock.sendMessage(m.chat, { video: payload, mimetype: 'video/mp4', caption, fileName }, opts);
    }
    return sock.sendMessage(m.chat, { document: payload, mimetype: mime, fileName, caption }, opts);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sends the images as a real WhatsApp album (one grouped bubble) using the same
 * protocol WhatsApp itself uses: an `albumMessage` parent plus image messages
 * associated to it. Returns how many images went out.
 */
async function sendAlbum(bot, m, images, caption) {
    const sock = bot?.sock || bot;
    const { generateWAMessageFromContent, generateWAMessage } = require('./baileys');
    if (typeof generateWAMessageFromContent !== 'function' || typeof generateWAMessage !== 'function'
        || typeof sock.relayMessage !== 'function' || typeof sock.waUploadToServer !== 'function') {
        throw codedError('ALBUM_UNSUPPORTED', 'This Baileys build cannot send albums');
    }

    const jid = m.chat;
    const quoted = m?.message ? m : undefined;
    const userJid = sock.user?.id;

    const parent = generateWAMessageFromContent(jid, {
        messageContextInfo: {},
        albumMessage: { expectedImageCount: images.length, expectedVideoCount: 0 },
    }, { userJid, quoted });
    await sock.relayMessage(jid, parent.message, { messageId: parent.key.id });

    let sent = 0;
    for (const [i, img] of images.entries()) {
        try {
            const msg = await generateWAMessage(
                jid,
                { image: img.buffer, mimetype: img.mimetype, caption: i === 0 ? caption : '' },
                { userJid, upload: sock.waUploadToServer },
            );
            msg.message.messageContextInfo = {
                messageAssociation: { associationType: 1, parentMessageKey: parent.key },
            };
            await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
            sent++;
            await sleep(250);
        } catch (err) {
            console.warn('[social-dl album image skipped]', i + 1, err.message);
        }
    }
    if (!sent) throw codedError('ALBUM_FAILED', 'No image could be added to the album');
    return sent;
}

/** Sends a photo carousel as an album; falls back to separate images if albums fail. */
async function sendPhotos(bot, m, result, caption) {
    const sock = bot?.sock || bot;
    const images = result.images;

    if (images.length === 1) {
        await sock.sendMessage(m.chat, { image: images[0].buffer, mimetype: images[0].mimetype, caption }, { quoted: m });
        return 1;
    }

    try {
        return await sendAlbum(bot, m, images, caption);
    } catch (err) {
        console.warn('[social-dl album fallback]', err.message);
    }

    let sentCount = 0;
    for (const [i, img] of images.entries()) {
        const cap = i === 0 ? `${caption}\n🖼️ 1/${images.length}` : `🖼️ ${i + 1}/${images.length}`;
        try {
            await sock.sendMessage(m.chat, { image: img.buffer, mimetype: img.mimetype, caption: cap }, { quoted: i === 0 ? m : undefined });
            sentCount++;
        } catch (err) {
            console.warn('[social-dl image send skipped]', i + 1, err.message);
        }
    }
    if (!sentCount) throw codedError('SEND_FAILED', 'WhatsApp could not send the images');
    return sentCount;
}

// ─── Errors ─────────────────────────────────────────────────────────────────
function friendlyError(err) {
    const code = String(err?.code || '');
    const name = `${err?.name || ''} ${err?.constructor?.name || ''}`;
    const msg = String(err?.message || err || '');
    const text = `${name} ${code} ${msg}`;

    if (/BotDetected|sign in to confirm you.?re not a bot|confirm you.?re not a bot/i.test(text)) {
        return 'The platform blocked this server as a bot. Set SOCIAL_DL_COOKIES to a cookies.txt path and try again.';
    }
    if (/PrivateError|private (video|post|account)|login required|requires? (a )?login/i.test(text)) return 'That post is private or needs a login.';
    if (/NotFoundError|NOT_FOUND|video unavailable|has been removed|was deleted/i.test(text)) return 'Media not found. The link may be deleted or invalid.';
    if (/UnsupportedError|unsupported url/i.test(text)) return "That link isn't supported.";
    if (code === 'EMPTY_DOWNLOAD') return 'The download came back empty. Try again or use another link.';
    if (code === 'MEDIA_TYPE_MISMATCH') return 'The platform returned a web page instead of media. It may be blocking this server.';
    if (code === 'NO_IMAGES' || code === 'NO_DOWNLOADABLE_IMAGES') return msg;
    if (code === 'NOT_A_TRACK' || code === 'PACKAGE_OUTDATED' || code === 'NOT_A_FILE') return msg;
    if (/timed out/i.test(text)) return 'The download timed out. Try again in a moment.';
    if (/too large/i.test(text)) return msg;
    if (/ENOENT/.test(text) && /yt-dlp|spawn/i.test(text)) {
        return 'The yt-dlp engine could not start on this server. Run npm install again and make sure python3 is available.';
    }
    if (/Cannot find (module|package) 'social-dl'|ERR_MODULE_NOT_FOUND/i.test(text)) {
        return 'The social-dl package is not installed. Run npm install and restart the bot.';
    }
    return `Download failed${code ? ` (${code})` : ''}: ${msg.slice(0, 140) || 'unknown error'}`;
}

// ─── One-call command runner used by every downloader command ───────────────
function cleanupResult(result) {
    if (!result) return;
    if (result.kind === 'file') result.media?.cleanup();
    if (result.kind === 'album') result.tracks?.forEach(t => t.cleanup());
}

/**
 * cfg:
 *   platforms   restrict to these platform keys (omit for "any supported")
 *   audioOnly   force audio (ytmp3, yturld)
 *   noWatermark ask for the watermark-free variant (TikTok)
 *   maxSeconds  refuse YouTube videos longer than this
 *   usage       text shown when no link is supplied
 */
async function runDownload(bot, m, args, cfg = {}) {
    const parsed = parseInput(m, args);

    if (!parsed.url) return m.reply(cfg.usage || `Send a link, or reply to a message that has one.\n\nSupported:\n${platformListText()}`);

    const url = await expandShortUrl(parsed.url);
    const platform = detectPlatform(url);

    if (!platform) {
        return m.reply(`That link isn't supported.\n\nSupported:\n${platformListText()}`);
    }
    if (cfg.platforms && !cfg.platforms.includes(platform)) {
        const wanted = cfg.platforms.map(p => PLATFORMS[p].label).join(' / ');
        return m.reply(`Please send a valid ${wanted} link.\n\n${cfg.usage || ''}`.trim());
    }

    const meta = PLATFORMS[platform];
    // TikTok is video-only: any mp3/audio flag is ignored.
    const audioOnly = platform !== 'tiktok' && (cfg.audioOnly || parsed.audioOnly || meta.type === 'music');

    if (parsed.audioOnly && meta.type === 'visual') {
        return m.reply(`${meta.label} has no audio-only mode.`);
    }

    await m.reply(`Downloading from ${meta.label}...`);

    const opts = {
        audioOnly,
        quality: parsed.quality || cfg.quality,
        lan: parsed.lan,
        noWatermark: (cfg.noWatermark === true || parsed.noWatermark) && platform === 'tiktok',
        timeoutMs: meta.slow ? SLOW_TIMEOUT : DOWNLOAD_TIMEOUT,
    };

    let result;
    try {
        let ytInfo = {};
        if (cfg.maxSeconds && platform === 'youtube' && !audioOnly) {
            ytInfo = await getInfo(url);
            if (ytInfo.duration && ytInfo.duration > cfg.maxSeconds) {
                return m.reply(`Video too long (max ${Math.round(cfg.maxSeconds / 60)} minutes). Use the audio command for audio only.`);
            }
        }

        result = await resolveMedia(url, platform, opts);

        if (result.kind === 'photos') {
            const info = { ...ytInfo, ...nonEmpty(result.info) };
            const sentCount = await sendPhotos(bot, m, result, buildCaption(platform, info));
            if (sentCount < result.total) await m.reply(`Sent ${sentCount} of ${result.total} images; the rest could not be downloaded or sent.`);
            return;
        }

        if (result.kind === 'album') {
            await m.reply(`*Audiomack album*\n${result.tracks.length} of ${result.total} tracks downloaded${result.failed ? ` (${result.failed} failed)` : ''}.`);
            for (const track of result.tracks) {
                const info = nonEmpty(track.info);
                await sendMedia(bot, m, track, { name: [info.author, info.title].filter(Boolean).join(' - ') || 'track' });
            }
            return;
        }

        const media = result.media;
        const info = { ...ytInfo, ...nonEmpty(media.info) };
        const caption = buildCaption(platform, info);
        if (media.type.kind === 'audio' && (info.title || info.author)) await m.reply(caption);
        await sendMedia(bot, m, media, {
            caption,
            name: [info.author, info.title].filter(Boolean).join(' - ') || `${platform}_media`,
        });
    } catch (err) {
        console.error(`[social-dl:${platform}]`, err?.code || '', err?.message || err);
        return m.reply(friendlyError(err));
    } finally {
        cleanupResult(result);
    }
}

/**
 * Builds a ready-to-load command for one platform, e.g.
 *     module.exports = makePlatformCommand({ platform: 'reelshort', name: 'reelshort', aliases: ['rs'] });
 */
function makePlatformCommand({ platform, name, aliases = [], description }) {
    const meta = PLATFORMS[platform];
    const flags = meta.type === 'music' ? '' : ' [--quality 720p|--best]';
    const lan = meta.slow ? ' [--lan en]' : '';
    return {
        name,
        aliases,
        category: 'downloader',
        reactions: { start: '📥' },
        description: description || `Download from ${meta.label}.`,
        usage: `.${name} <link>${flags}${lan}`,

        async execute(bot, m, args) {
            const prefix = bot.prefix || '.';
            return runDownload(bot, m, args, {
                platforms: [platform],
                usage:
                    `Usage: ${prefix}${name} <${meta.label} link>${flags}${lan}\n` +
                    `Example: ${prefix}${name} ${meta.example}\n` +
                    'You can also reply to a message that has the link.',
            });
        },
    };
}

module.exports = {
    PLATFORMS,
    MAX_VIDEO_SECONDS,
    detectPlatform,
    platformListText,
    parseInput,
    expandShortUrl,
    getInfo,
    resolveMedia,
    fetchMedia,
    sendMedia,
    sendPhotos,
    sendAlbum,
    buildCaption,
    safeName,
    friendlyError,
    extractAudiomackTrackUrls,
    runDownload,
    makePlatformCommand,
};
