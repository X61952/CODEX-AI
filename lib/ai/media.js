/**
 * CODEX AI — media toolbox used by the chatbot (and .transcribe).
 * Everything here takes/returns Buffers so the chatbot layer stays tiny.
 *
 * Uses: sharp (images), ffmpeg (video/audio — same bundled binary the rest of
 * the bot uses), library/exif.js (WhatsApp sticker metadata).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { downloadContentFromMessage } = require('../baileys');

let sharp = null;
try { sharp = require('sharp'); } catch { sharp = null; }

const ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..', '..');
const TEMP = path.join(ROOT, 'temp');

const REMOVEBG_URL = 'https://removebg-api-kord-two.vercel.app/api/removebg';

function _needSharp() {
    if (!sharp) throw new Error('Image engine (sharp) is not installed.');
    return sharp;
}

function _ffmpegBin() {
    try { return require('@ffmpeg-installer/ffmpeg').path; } catch { /* next */ }
    try { return require('ffmpeg-static'); } catch { /* next */ }
    return 'ffmpeg';
}

function _tmp(ext) {
    fs.mkdirSync(TEMP, { recursive: true });
    return path.join(TEMP, `ai_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`);
}
function _rm(...files) { for (const f of files) { try { fs.rmSync(f, { force: true }); } catch { /* ignore */ } } }

function _ff(args, timeout = 60000) {
    return new Promise((resolve, reject) => {
        execFile(_ffmpegBin(), ['-y', '-hide_banner', '-loglevel', 'error', ...args], { timeout, maxBuffer: 20 * 1024 * 1024 }, (err, _o, se) => {
            if (err) reject(new Error(String(se || err.message).slice(0, 200)));
            else resolve();
        });
    });
}

// ── download ────────────────────────────────────────────────────────────────
async function download(content, type) {
    const stream = await downloadContentFromMessage(content, type);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

// ── image helpers ───────────────────────────────────────────────────────────
/** Any image/sticker buffer → JPEG (white background where transparent). */
async function toJpeg(buffer, max = 1600, quality = 85) {
    const s = _needSharp();
    return s(buffer, { animated: false })
        .rotate()
        .flatten({ background: '#ffffff' })
        .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
}
async function toBase64Jpeg(buffer) {
    const jpg = await toJpeg(buffer);
    return { base64: jpg.toString('base64'), mimetype: 'image/jpeg' };
}
async function toPng(buffer) {
    return _needSharp()(buffer, { animated: false }).png().toBuffer();
}

async function isAnimated(buffer) {
    try {
        const meta = await _needSharp()(buffer, { animated: true }).metadata();
        return !!(meta.pages && meta.pages > 1);
    } catch { return false; }
}

// ── remove background (your API) ───────────────────────────────────────────
async function removeBackground(buffer, bot) {
    const jpg = await toJpeg(buffer, 2000, 90);
    const url = bot?.config?.REMOVEBG_API || REMOVEBG_URL;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 70000);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: `data:image/jpeg;base64,${jpg.toString('base64')}` }),
            signal: ctrl.signal,
        });
        if (!res.ok) throw new Error('The background-removal service is down right now.');
        const out = Buffer.from(await res.arrayBuffer());
        if (out.length < 500 || out[0] === 0x7b /* '{' = json error */) throw new Error('Background removal failed.');
        return out;
    } finally { clearTimeout(timer); }
}

// ── stickers ────────────────────────────────────────────────────────────────
async function _exif() { return require('../../library/exif'); }

/** Static image → 512x512 WebP sticker (transparent padding) with pack/author. */
async function imageToSticker(buffer, { pack, author, round = false } = {}) {
    const s = _needSharp();
    let img = s(buffer, { animated: false }).rotate();
    let webp;
    if (round) {
        const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="#fff"/></svg>');
        const square = await img.resize(512, 512, { fit: 'cover' }).png().toBuffer();
        webp = await s(square).composite([{ input: mask, blend: 'dest-in' }]).webp({ quality: 85 }).toBuffer();
    } else {
        webp = await img
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp({ quality: 85 })
            .toBuffer();
    }
    const { addExif } = await _exif();
    return addExif(webp, pack, author, ['']);
}

/** Video/GIF → animated sticker (max ~10s) with pack/author. */
async function videoToSticker(buffer, { pack, author } = {}) {
    const { videoToWebp, addExif } = await _exif();
    return addExif(await videoToWebp(buffer), pack, author, ['']);
}

/** Existing WebP sticker → same sticker with new pack/author. */
async function repack(webp, { pack, author } = {}) {
    const { addExif } = await _exif();
    return addExif(webp, pack, author, ['']);
}

async function stickerToPng(buffer) {
    return _needSharp()(buffer, { animated: false }).png().toBuffer();
}

/** Sticker (animated or static) → MP4 that WhatsApp plays as a GIF. */
async function stickerToGifVideo(buffer) {
    const input = _tmp('gif'), still = _tmp('png'), output = _tmp('mp4');
    try {
        const vf = 'scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,format=yuv420p';
        if (await isAnimated(buffer)) {
            fs.writeFileSync(input, await _needSharp()(buffer, { animated: true }).gif().toBuffer());
            await _ff(['-i', input, '-vf', vf, '-movflags', '+faststart', '-an', output]);
        } else {
            const flat = await _needSharp()(buffer, { animated: false }).flatten({ background: '#ffffff' }).png().toBuffer();
            fs.writeFileSync(still, flat);
            await _ff(['-loop', '1', '-i', still, '-t', '3', '-r', '15', '-vf', vf, '-movflags', '+faststart', '-an', output]);
        }
        return fs.readFileSync(output);
    } finally { _rm(input, still, output); }
}

// ── resize / tweak ──────────────────────────────────────────────────────────
const PRESETS = { tiny: 320, small: 480, medium: 800, large: 1280, big: 1280, hd: 1920, '4k': 3840 };

/** "800x600" | "800" | "x600" | "50%" | "half" | "small|medium|large|hd" → spec or null */
function parseResizeSpec(text) {
    const t = String(text || '').toLowerCase().trim();
    if (!t) return null;
    let m = t.match(/(\d{2,4})\s*[x×*]\s*(\d{2,4})/);
    if (m) return { width: +m[1], height: +m[2] };
    m = t.match(/(\d{1,3})\s*%/);
    if (m && +m[1] >= 1 && +m[1] <= 400) return { percent: +m[1] };
    if (/\bhalf\b/.test(t)) return { percent: 50 };
    if (/\bdouble\b/.test(t)) return { percent: 200 };
    for (const k of Object.keys(PRESETS)) if (new RegExp(`\\b${k}\\b`).test(t)) return { width: PRESETS[k] };
    m = t.match(/(?:width|w)\s*(?:of|=|to)?\s*(\d{2,4})|^(\d{2,4})(?:\s*px)?$|(\d{2,4})\s*px/);
    if (m) return { width: +(m[1] || m[2] || m[3]) };
    m = t.match(/(?:height|h)\s*(?:of|=|to)?\s*(\d{2,4})/);
    if (m) return { height: +m[1] };
    return null;
}

async function resizeImage(buffer, spec) {
    const s = _needSharp();
    const base = s(buffer, { animated: false }).rotate();
    const meta = await s(buffer, { animated: false }).metadata();
    let w = spec.width, h = spec.height;
    if (spec.percent) {
        w = Math.round((meta.width || 512) * spec.percent / 100);
        h = Math.round((meta.height || 512) * spec.percent / 100);
    }
    w = w ? Math.min(w, 4096) : undefined;
    h = h ? Math.min(h, 4096) : undefined;
    const out = await base.resize({ width: w, height: h, fit: spec.width && spec.height ? 'fill' : 'inside', withoutEnlargement: false }).jpeg({ quality: 90 }).toBuffer();
    const m2 = await s(out).metadata();
    return { buffer: out, width: m2.width, height: m2.height };
}

async function blackAndWhite(buffer) {
    return _needSharp()(buffer, { animated: false }).rotate().grayscale().jpeg({ quality: 90 }).toBuffer();
}

async function compress(buffer) {
    const s = _needSharp();
    const out = await s(buffer, { animated: false }).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 55, mozjpeg: true }).toBuffer();
    return out;
}

// ── video / audio ───────────────────────────────────────────────────────────
async function videoFrame(buffer) {
    const input = _tmp('mp4'), output = _tmp('jpg');
    try {
        fs.writeFileSync(input, buffer);
        await _ff(['-i', input, '-frames:v', '1', '-q:v', '3', output]);
        return fs.readFileSync(output);
    } finally { _rm(input, output); }
}

/** Audio track of a video as mp3 (null when the video has no sound). */
async function audioFromVideo(buffer, seconds = 600) {
    const input = _tmp('mp4'), output = _tmp('mp3');
    try {
        fs.writeFileSync(input, buffer);
        await _ff(['-i', input, '-t', String(seconds), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', output]);
        if (!fs.existsSync(output)) return null;
        const out = fs.readFileSync(output);
        return out.length > 2000 ? out : null;
    } catch { return null; } finally { _rm(input, output); }
}

/** Any audio → 16 kHz mono mp3 (fallback format for Whisper). */
async function toMp3(buffer) {
    const input = _tmp('ogg'), output = _tmp('mp3');
    try {
        fs.writeFileSync(input, buffer);
        await _ff(['-i', input, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', output]);
        return fs.existsSync(output) ? fs.readFileSync(output) : null;
    } catch { return null; } finally { _rm(input, output); }
}

// ── OCR (OCR.space — same service as your .scan command) ────────────────────
const OCR_KEY = 'K82707468388957';

/** Image buffer → text (or '' when nothing readable). Throws on service errors. */
async function ocrSpace(buffer, bot) {
    // the free OCR.space plan rejects files over ~1 MB, so shrink first
    let jpg = await toJpeg(buffer, 1800, 85);
    if (jpg.length > 950 * 1024) jpg = await toJpeg(buffer, 1400, 70);
    if (jpg.length > 950 * 1024) jpg = await toJpeg(buffer, 1000, 60);
    const form = new FormData();
    form.append('apikey', bot?.config?.OCRSPACE_API_KEY || OCR_KEY);
    form.append('language', 'eng');
    form.append('isOverlayRequired', 'false');
    form.append('file', new Blob([jpg], { type: 'image/jpeg' }), 'scan.jpg');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
        const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form, signal: ctrl.signal });
        const data = await res.json();
        return String(data?.ParsedResults?.[0]?.ParsedText || '').trim();
    } finally { clearTimeout(timer); }
}

// ── voice notes out: any audio → WhatsApp voice-note format (ogg/opus) ──────
async function toOpus(buffer, ext = 'mp3') {
    const input = _tmp(ext), output = _tmp('ogg');
    try {
        fs.writeFileSync(input, buffer);
        try {
            await _ff(['-i', input, '-vn', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-f', 'ogg', output]);
        } catch {
            await _ff(['-i', input, '-vn', '-c:a', 'opus', '-strict', '-2', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-f', 'ogg', output]);
        }
        const out = fs.readFileSync(output);
        return out.length > 500 ? out : null;
    } catch (e) { console.error('[voice] opus encode failed:', e.message); return null; } finally { _rm(input, output); }
}

module.exports = {
    ocrSpace, toOpus,
    download, toJpeg, toBase64Jpeg, toPng, isAnimated,
    removeBackground,
    imageToSticker, videoToSticker, repack, stickerToPng, stickerToGifVideo,
    parseResizeSpec, resizeImage, blackAndWhite, compress,
    videoFrame, audioFromVideo, toMp3,
};
