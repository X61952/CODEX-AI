'use strict';

/**
 * Shared toolkit for the `image` command category.
 *
 *  - bundled fonts (assets/fonts) so text renders the same on every panel
 *  - finding the image a command should work on (attached image, replied image,
 *    replied sticker, or the profile picture of the replied / mentioned user)
 *  - small canvas helpers used by the gfx / effect renderers
 *
 * Everything is rendered locally with @napi-rs/canvas + sharp, so none of the
 * image commands depend on third-party APIs any more.
 */

const sharp = require('sharp');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { dlBuffer } = require('./dlmedia');
const { resolveLookupTarget, getProfilePictureUrl } = require('./lookupTarget');

// ─── Fonts ──────────────────────────────────────────────────────────────────
// Embedded in lib/imageFonts.js, so no asset files are needed.
(function registerFonts() {
    const embedded = require('./imageFonts');
    for (const [family, base64] of Object.entries(embedded)) {
        try {
            GlobalFonts.register(Buffer.from(base64, 'base64'), family);
        } catch { /* a missing font just falls back to the system one */ }
    }
})();

const FALLBACK = '"Noto Sans", "DejaVu Sans", Arial, sans-serif';
const font = {
    bold: size => `${size}px CodexBold, ${FALLBACK}`,
    boldItalic: size => `${size}px CodexBoldItalic, ${FALLBACK}`,
    medium: size => `${size}px CodexMedium, ${FALLBACK}`,
    mono: size => `${size}px CodexMono, "DejaVu Sans Mono", monospace`,
    monoBold: size => `${size}px CodexMonoBold, "DejaVu Sans Mono", monospace`,
    serif: size => `${size}px CodexSerif, "DejaVu Serif", Georgia, serif`,
};

// ─── Errors ─────────────────────────────────────────────────────────────────
function codedError(code, message) {
    return Object.assign(new Error(message || code), { code });
}

function friendlyError(err) {
    if (err?.code === 'NO_IMAGE') return err.message;
    if (err?.code === 'BAD_INPUT') return err.message;
    return `Failed: ${String(err?.message || err).slice(0, 160)}`;
}

/** Runs a command body; any error becomes a short reply instead of a crash. */
async function guard(m, fn) {
    try {
        await fn();
    } catch (err) {
        console.error('[image]', err?.code || '', err?.message || err);
        await m.reply(friendlyError(err));
    }
}

// ─── Finding the input image ────────────────────────────────────────────────
const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage'];

function unwrap(content) {
    let c = content;
    for (let i = 0; i < 4 && c; i++) {
        const key = WRAPPERS.find(k => c[k]?.message);
        if (!key) break;
        c = c[key].message;
    }
    return c;
}

function quotedContent(m) {
    return unwrap(
        m?.msg?.contextInfo?.quotedMessage
        || m?.message?.extendedTextMessage?.contextInfo?.quotedMessage
        || m?.quoted?.message
        || null,
    );
}

function mediaTypeOf(content) {
    if (!content) return null;
    if (content.imageMessage) return 'image';
    if (content.stickerMessage) return 'sticker';
    if (content.documentMessage && /^image\//i.test(content.documentMessage.mimetype || '')) return 'document';
    return null;
}

const MAX_SIDE = 1280;

/** Anything sharp can read → PNG, upright, capped in size. */
async function normalize(buffer, maxSide = MAX_SIDE) {
    return sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
}

/** The image attached to / replied to by this message, or null. */
async function getMessageImage(m, maxSide = MAX_SIDE) {
    const sources = [unwrap(m?.message), quotedContent(m)];
    for (const content of sources) {
        const type = mediaTypeOf(content);
        if (!type) continue;
        const raw = await dlBuffer(content, type);
        return normalize(raw, maxSide);
    }
    return null;
}

async function placeholderAvatar(size = 640) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, '#5b6b8c');
    g.addColorStop(1, '#2c3550');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath();
    ctx.arc(size / 2, size * 0.38, size * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(size / 2, size * 0.86, size * 0.32, size * 0.3, 0, Math.PI, 0);
    ctx.fill();
    return canvas.toBuffer('image/png');
}

/** Profile picture of the replied / mentioned / typed user (or the sender). */
async function getAvatar(bot, m, args = []) {
    const target = resolveLookupTarget(m, args);
    if (target.invalid) throw codedError('BAD_INPUT', 'That number does not look valid.');
    try {
        const url = await getProfilePictureUrl(bot, target.jid);
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { buffer: await normalize(Buffer.from(await res.arrayBuffer())), placeholder: false };
    } catch {
        // No picture (privacy settings) → neutral silhouette so the command still works
        return { buffer: await normalize(await placeholderAvatar()), placeholder: true };
    }
}

/**
 * options.requireImage → only real images count (remini, invert...). Otherwise falls
 * back to the profile picture of the replied / mentioned user, or the sender's own.
 */
async function getInputImage(bot, m, args = [], { requireImage = false, maxSide = MAX_SIDE } = {}) {
    const image = await getMessageImage(m, maxSide);
    if (image) return { buffer: image, source: 'image' };
    if (requireImage) throw codedError('NO_IMAGE', 'Reply to an image (or send one with the command).');
    const avatar = await getAvatar(bot, m, args);
    return { buffer: avatar.buffer, source: avatar.placeholder ? 'placeholder' : 'avatar' };
}

// ─── Text helpers ───────────────────────────────────────────────────────────
/** Text typed after the command with line breaks kept (args lose them). */
function rawArgText(m) {
    return String(m?.text || '').replace(/^\S+[ \t]*\r?\n?/, '');
}

function quotedText(m) {
    const q = m?.msg?.contextInfo?.quotedMessage || m?.message?.extendedTextMessage?.contextInfo?.quotedMessage || m?.quoted?.message || {};
    const c = unwrap(q) || {};
    return c.conversation || c.extendedTextMessage?.text || c.imageMessage?.caption || c.videoMessage?.caption || '';
}

function cleanText(text, max = 28) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

// ─── Canvas helpers ─────────────────────────────────────────────────────────
function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}

/** Largest font size (≤ start) at which `text` fits in maxW. */
function fitSize(ctx, text, fontFn, maxW, start = 200, min = 24) {
    let size = start;
    ctx.font = fontFn(size);
    while (size > min && ctx.measureText(text).width > maxW) {
        size -= 4;
        ctx.font = fontFn(size);
    }
    return size;
}

function spacedWidth(ctx, text, spacing) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + spacing;
    return w - spacing;
}

/** Letter-spaced text. mode: 'fill' | 'stroke'. align: 'center' | 'left'. */
function drawSpaced(ctx, text, x, y, spacing = 8, mode = 'fill', align = 'center') {
    const total = spacedWidth(ctx, text, spacing);
    let cx = align === 'center' ? x - total / 2 : x;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const ch of text) {
        if (mode === 'stroke') ctx.strokeText(ch, cx, y); else ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + spacing;
    }
    ctx.textAlign = prevAlign;
    return total;
}

/** Draws img to fill (x,y,w,h), cropping the overflow like CSS object-fit: cover. */
function drawCover(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function rng(seed = 1) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function vignette(ctx, w, h, strength = 0.55) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

function grain(ctx, w, h, amount = 0.05, seed = 7) {
    const rand = rng(seed);
    const count = Math.floor((w * h) / 90);
    for (let i = 0; i < count; i++) {
        ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${amount})` : `rgba(0,0,0,${amount})`;
        ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
    }
}

function sparkle(ctx, x, y, r, color = '#fff') {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = r * 1.2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const ang = (Math.PI / 4) * i;
        const rad = i % 2 === 0 ? r : r * 0.22;
        ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function encode(canvas, format = 'png', quality = 92) {
    return format === 'jpeg' ? canvas.toBuffer('image/jpeg', quality) : canvas.toBuffer('image/png');
}

// ─── Sending ────────────────────────────────────────────────────────────────
const CAPTION = '_Powered by CODEX AI_';

async function sendImage(bot, m, buffer, { caption = CAPTION, mimetype = 'image/png' } = {}) {
    return bot.sock.sendMessage(m.chat, { image: buffer, mimetype, caption }, { quoted: m });
}

module.exports = {
    font,
    CAPTION,
    codedError,
    friendlyError,
    guard,
    getMessageImage,
    getAvatar,
    getInputImage,
    normalize,
    rawArgText,
    quotedText,
    cleanText,
    roundRectPath,
    fitSize,
    spacedWidth,
    drawSpaced,
    drawCover,
    rng,
    vignette,
    grain,
    sparkle,
    encode,
    sendImage,
    createCanvas,
    loadImage,
};
         
