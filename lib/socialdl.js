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
 *   --lan en | --lang en                subtitle/dub language (short dramas)
 *   mp3 | --mp3                         audio only
 *   --no-watermark                      watermark-free variant when supported
 */
function parseInput(m, args = []) {
    const list = (Array.isArray(args) ? args : []).map(a => String(a));
    let url = list.find(a => /^https?:\/\//i.test(a)) || '';
    if (!url) url = quotedUrl(m) || '';

    let audioOnly = false;
    let quality;
    let lang;
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
            if (v && !v.startsWith('-')) { lang = v; i++; }
        } else if (/^(\d{3,4}p|best)$/.test(a)) quality = a;
    }
    return { url: url.replace(/[)\]>.,]+$/, ''), audioOnly, quality, lang, noWatermark };
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
        if (brand === 'M4A ' || brand === 'M4B ') return { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };
        return { kind: 'video', mime: 'video/mp4', ext: 'mp4' };
    }
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: 'video', mime: 'video/webm', ext: 'webm' };
    if (at(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
    if (at(0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg', ext: 'ogg' };
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
function pickTitleInfo(obj) {
    const d = obj?.data || obj?.result || obj?.info || obj || {};
    if (!d || typeof d !== 'object') return {};
    return {
        title: d.title || d.name || d.meta?.title || '',
        author: d.author || d.uploader || d.channel || d.username || d.meta?.author || '',
        duration: Number(d.duration || d.durationSec || d.duration_seconds || d.meta?.duration) || 0,
        thumbnail: d.thumbnail || d.thumb || d.meta?.thumbnail || '',
    };
}

/** Metadata only (no file written). Never throws. */
async function getInfo(url, opts = {}) {
    try {
        const { universalDl } = await loadPackage();
        const res = await withTimeout(universalDl(url, { ...cookieOptions(), ...opts }), 60000);
        return pickTitleInfo(res);
    } catch {
        return {};
    }
}

function findSavedFile(dest, ret) {
    const candidates = [];
    if (typeof ret === 'string') candidates.push(ret);
    for (const k of ['path', 'file', 'filePath', 'filename', 'destination', 'output']) {
        if (ret && typeof ret[k] === 'string') candidates.push(ret[k]);
    }
    candidates.push(dest);
    for (const c of candidates) {
        try { if (fs.statSync(c).size > 0) return c; } catch {}
    }
    // yt-dlp sometimes appends/changes the extension
    const base = path.basename(dest, path.extname(dest));
    try {
        const hit = fs.readdirSync(getTempDir())
            .filter(f => f.startsWith(base))
            .map(f => path.join(getTempDir(), f))
            .find(f => { try { return fs.statSync(f).size > 0; } catch { return false; } });
        if (hit) return hit;
    } catch {}
    return null;
}

function cleanupFor(dest, extra = []) {
    const base = path.basename(dest, path.extname(dest));
    try {
        for (const f of fs.readdirSync(getTempDir())) {
            if (f.startsWith(base)) { try { fs.unlinkSync(path.join(getTempDir(), f)); } catch {} }
        }
    } catch {}
    for (const f of extra) { try { fs.unlinkSync(f); } catch {} }
}

/**
 * Downloads `url` to the temp dir through social-dl.
 * Resolves with { file, size, type, info, cleanup } — call cleanup() when done.
 */
async function fetchMedia(url, { audioOnly = false, quality, noWatermark = false, lang, timeoutMs = DOWNLOAD_TIMEOUT } = {}) {
    await acquire();
    const dest = createTempFilePath('sdl', audioOnly ? 'mp3' : 'mp4');
    const extra = [];
    try {
        const { universalSave } = await loadPackage();
        const options = { audioOnly, ...cookieOptions() };
        if (quality) options.quality = quality;
        if (noWatermark) options.noWatermark = true;
        if (lang) { options.lang = lang; options.lan = lang; }

        const ret = await withTimeout(universalSave(url, dest, options), timeoutMs);
        let file = findSavedFile(dest, ret);
        if (!file) throw new Error('NotFound: nothing was downloaded');

        let type = sniffFile(file);
        if (audioOnly && type && type.kind !== 'audio') type = { kind: 'audio', mime: 'audio/mp4', ext: 'm4a' };

        // Prefer a real mp3 for audio requests when the source gave us m4a/ogg.
        if (audioOnly && type?.ext !== 'mp3') {
            const mp3 = await convertToMp3(file);
            if (mp3) {
                extra.push(mp3);
                file = mp3;
                type = { kind: 'audio', mime: 'audio/mpeg', ext: 'mp3' };
            }
        }

        const size = fs.statSync(file).size;
        if (size > MAX_FILE_BYTES) {
            throw new Error(`File is too large to send (${(size / 1048576).toFixed(0)} MB, limit ${MAX_FILE_BYTES / 1048576} MB)`);
        }

        return {
            file,
            size,
            type: type || { kind: 'video', mime: 'video/mp4', ext: 'mp4' },
            info: pickTitleInfo(ret),
            cleanup: () => cleanupFor(dest, extra),
        };
    } catch (err) {
        cleanupFor(dest, extra);
        throw err;
    } finally {
        release();
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

// ─── Errors ─────────────────────────────────────────────────────────────────
function friendlyError(err) {
    const name = `${err?.name || ''} ${err?.constructor?.name || ''}`;
    const msg = String(err?.message || err || '');
    const text = `${name} ${msg}`;
    if (/BotDetected|bot.?check|sign in to confirm/i.test(text)) {
        return 'The platform blocked the server as a bot. Set SOCIAL_DL_COOKIES to a cookies.txt path and try again.';
    }
    if (/Private|login|log in|authentication/i.test(text)) return 'That post is private or needs a login.';
    if (/NotFound|not found|unavailable|removed|deleted/i.test(text)) return 'Media not found. The link may be deleted or invalid.';
    if (/Unsupported|unsupported url/i.test(text)) return "That link isn't supported.";
    if (/timed out/i.test(text)) return 'The download timed out. Try again in a moment.';
    if (/too large/i.test(text)) return msg;
    if (/ENOENT|yt-dlp/i.test(text) && /spawn|binary|ENOENT/i.test(text)) {
        return 'The yt-dlp engine could not start on this server. Run npm install again and make sure python3 is available.';
    }
    if (/Cannot find (module|package) 'social-dl'|ERR_MODULE_NOT_FOUND/i.test(text)) {
        return 'The social-dl package is not installed. Run npm install and restart the bot.';
    }
    return `Download failed: ${msg.slice(0, 140) || 'unknown error'}`;
}

// ─── Photo posts / carousels (TikTok, Pinterest, Threads, RedNote) ──────────
const IMG_RE = /\.(jpe?g|png|webp)(\?|#|$)/i;
const SKIP_KEYS = /thumb|cover|avatar|poster|preview|profile|icon|logo/i;

function collectImageUrls(node, out = new Set(), depth = 0) {
    if (!node || depth > 5) return out;
    if (typeof node === 'string') {
        if (/^https?:\/\//i.test(node) && IMG_RE.test(node)) out.add(node);
    } else if (Array.isArray(node)) {
        node.forEach(n => collectImageUrls(n, out, depth + 1));
    } else if (typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
            if (SKIP_KEYS.test(k)) continue;
            collectImageUrls(v, out, depth + 1);
        }
    }
    return out;
}

/** Returns up to 10 image URLs when the post is a photo carousel, else []. */
async function getCarouselImages(url) {
    try {
        const { universalDl } = await loadPackage();
        const res = await withTimeout(universalDl(url, cookieOptions()), 60000);
        const urls = [...collectImageUrls(res)];
        return urls.length >= 2 ? urls.slice(0, 10) : [];
    } catch {
        return [];
    }
}

async function sendImages(bot, m, urls, caption) {
    const sock = bot?.sock || bot;
    let sentCount = 0;
    for (let i = 0; i < urls.length; i++) {
        try {
            const res = await axios.get(urls[i], {
                responseType: 'arraybuffer',
                timeout: 30000,
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            const buf = Buffer.from(res.data);
            if (buf.length < 1024) continue;
            await sock.sendMessage(m.chat, { image: buf, caption: i === 0 ? caption : '' }, { quoted: m });
            sentCount++;
        } catch { /* skip a bad image, keep going */ }
    }
    return sentCount;
}

// ─── One-call command runner used by every downloader command ───────────────
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
    const audioOnly = cfg.audioOnly || parsed.audioOnly || meta.type === 'music';

    if (parsed.audioOnly && meta.type === 'visual') {
        return m.reply(`${meta.label} has no audio-only mode.`);
    }

    await m.reply(`Downloading from ${meta.label}...`);

    const opts = {
        audioOnly,
        quality: parsed.quality || cfg.quality,
        lang: parsed.lang,
        noWatermark: (cfg.noWatermark === true || parsed.noWatermark) && platform === 'tiktok',
        timeoutMs: meta.slow ? SLOW_TIMEOUT : DOWNLOAD_TIMEOUT,
    };

    let media;
    try {
        let info = {};
        if (cfg.maxSeconds && platform === 'youtube' && !audioOnly) {
            info = await getInfo(url);
            if (info.duration && info.duration > cfg.maxSeconds) {
                return m.reply(`Video too long (max ${Math.round(cfg.maxSeconds / 60)} minutes). Use the audio command for audio only.`);
            }
        }

        let failure = null;
        try {
            media = await fetchMedia(url, opts);
        } catch (err) {
            failure = err;
        }

        // Photo carousels: only checked when the normal path failed or gave one image.
        if (meta.images && !audioOnly && (failure || media?.type?.kind === 'image')) {
            const images = await getCarouselImages(url);
            if (images.length) {
                const sentCount = await sendImages(bot, m, images, buildCaption(platform, info));
                if (sentCount) return;
            }
        }
        if (failure) throw failure;

        const merged = { ...info, ...Object.fromEntries(Object.entries(media.info).filter(([, v]) => v)) };
        await sendMedia(bot, m, media, {
            caption: buildCaption(platform, merged),
            name: merged.title || `${platform}_media`,
        });
    } catch (err) {
        console.error(`[social-dl:${platform}]`, err?.message || err);
        return m.reply(friendlyError(err));
    } finally {
        media?.cleanup();
    }
}

/**
 * Builds a ready-to-load command for one platform, e.g.
 *   module.exports = makePlatformCommand({ platform: 'reelshort', name: 'reelshort', aliases: ['rs'] });
 */
function makePlatformCommand({ platform, name, aliases = [], description }) {
    const meta = PLATFORMS[platform];
    const flags = meta.type === 'music' ? '' : ' [--quality 720p|--best]';
    const lang = meta.slow ? ' [--lan en]' : '';
    return {
        name,
        aliases,
        category: 'downloader',
        reactions: { start: '📥' },
        description: description || `Download from ${meta.label}.`,
        usage: `.${name} <link>${flags}${lang}`,

        async execute(bot, m, args) {
            const prefix = bot.prefix || '.';
            return runDownload(bot, m, args, {
                platforms: [platform],
                usage:
                    `Usage: ${prefix}${name} <${meta.label} link>${flags}${lang}\n` +
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
    fetchMedia,
    sendMedia,
    buildCaption,
    safeName,
    friendlyError,
    runDownload,
    makePlatformCommand,
};
