'use strict';

/**
 * Greeting cards (1280x720) for the owner greetings.
 *
 * One photo per time of day lives in assets/greetings/:
 *   morning.jpg    aurora cabin          (7:00 AM)
 *   afternoon.jpg  sunny fairy beach     (12:00 PM)
 *   evening.jpg    twilight fairy forest (4:00 PM)
 *   night.jpg      moonlit cabin         (9:00 PM)
 *
 * The photo is shaded a little for readability, then the greeting, the owner
 * name and the local time are written on top. Rendered with the image engine
 * (canvas + embedded fonts), no web APIs.
 */

const fs = require('fs');
const path = require('path');
const {
    font, createCanvas, loadImage, drawCover, vignette, grain, roundRectPath,
    fitSize, drawSpaced, sparkle, rng, encode,
} = require('./imageKit');

const W = 1280;
const H = 720;
const ASSETS = process.env.CODEX_PROJECT_ROOT
    ? path.join(process.env.CODEX_PROJECT_ROOT, 'assets/greetings')
    : path.join(__dirname, '..', 'assets', 'greetings');

const THEMES = {
    morning: {
        title: 'GOOD MORNING',
        kickers: ['RISE  &  SHINE', 'A  NEW  DAY', 'FRESH  START', 'HELLO  SUNRISE'],
        text: '#ffffff', accent: '#8ffbe2', shadow: 'rgba(2,28,58,0.85)', glow: 'rgba(110,255,225,0.55)',
        top: 0.34, bottom: 0.5, fallback: ['#0b3b63', '#1e8f8a', '#cfe9f2'],
    },
    afternoon: {
        title: 'GOOD AFTERNOON',
        kickers: ['KEEP  GLOWING', 'STAY  BRIGHT', 'ENJOY  THE  SUN', 'SHINE  ON'],
        text: '#ffffff', accent: '#fff0b8', shadow: 'rgba(0,45,80,0.9)', glow: 'rgba(255,235,160,0.55)',
        top: 0.5, bottom: 0.46, fallback: ['#5fb4e8', '#7fd6e4', '#f6efd0'],
    },
    evening: {
        title: 'GOOD EVENING',
        kickers: ['GOLDEN  HOUR', 'TWILIGHT  MAGIC', 'SOFT  &  CALM', 'UNWIND  &  GLOW'],
        text: '#ffffff', accent: '#ffd9a8', shadow: 'rgba(38,10,70,0.9)', glow: 'rgba(255,190,150,0.55)',
        top: 0.4, bottom: 0.5, fallback: ['#3a2a6b', '#8a5aa8', '#f2a672'],
    },
    night: {
        title: 'GOOD NIGHT',
        kickers: ['SWEET  DREAMS', 'REST  WELL', 'STARRY  NIGHT', 'SLEEP  TIGHT'],
        text: '#ffffff', accent: '#bcd9ff', shadow: 'rgba(0,6,32,0.92)', glow: 'rgba(150,190,255,0.5)',
        top: 0.3, bottom: 0.5, fallback: ['#050b24', '#0f2a4a', '#1d4a6b'],
    },
};

const images = new Map();

async function background(slot) {
    if (images.has(slot)) return images.get(slot);
    let img = null;
    try {
        img = await loadImage(fs.readFileSync(path.join(ASSETS, `${slot}.jpg`)));
    } catch { /* missing photo: a gradient is used instead */ }
    images.set(slot, img);
    return img;
}

function shade(ctx, y0, y1, a0, a1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(0,0,0,${a0})`);
    g.addColorStop(1, `rgba(0,0,0,${a1})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
}

/** A thin line – sparkle – line ornament centred on x. */
function ornament(ctx, x, y, accent) {
    ctx.save();
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.85; ctx.lineWidth = 2;
    ctx.shadowColor = accent; ctx.shadowBlur = 10;
    for (const dir of [-1, 1]) {
        const g = ctx.createLinearGradient(x + dir * 24, 0, x + dir * 190, 0);
        g.addColorStop(0, accent); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(x + dir * 24, y); ctx.lineTo(x + dir * 190, y); ctx.stroke();
    }
    ctx.restore();
    sparkle(ctx, x, y, 11, accent);
}

/**
 * slot: 'morning' | 'afternoon' | 'evening' | 'night'
 * info: { name: owner name, time: '7:00 AM', date: 'Monday, 9 November', zone: 'Africa/Lagos (GMT+1)', variant: number }
 * Resolves with a JPEG Buffer.
 */
async function renderGreetingCard(slot, info = {}) {
    const theme = THEMES[slot] || THEMES.morning;
    const kicker = theme.kickers[Math.abs(Number(info.variant) || 0) % theme.kickers.length];

    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');

    // ── photo (or gradient when the file is missing) ──
    const photo = await background(slot);
    if (photo) {
        drawCover(ctx, photo, 0, 0, W, H);
    } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        theme.fallback.forEach((col, i) => g.addColorStop(i / (theme.fallback.length - 1), col));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    shade(ctx, 0, H * 0.62, theme.top, 0);
    shade(ctx, H * 0.55, H, 0, theme.bottom);

    // a few twinkles in the corners
    const r = rng(slot.length * 97 + 11);
    for (let i = 0; i < 7; i++) {
        const left = i % 2 === 0;
        const x = left ? 40 + r() * 230 : W - 40 - r() * 230;
        const y = 40 + r() * 190;
        ctx.globalAlpha = 0.5 + r() * 0.45;
        sparkle(ctx, x, y, 5 + r() * 8, theme.accent);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    // ── kicker ──
    ctx.font = font.medium(34); ctx.fillStyle = theme.accent; ctx.globalAlpha = 0.95;
    ctx.shadowColor = theme.shadow; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
    drawSpaced(ctx, kicker, W / 2, 118, 12);
    ctx.globalAlpha = 1;

    // ── title ──
    const size = fitSize(ctx, theme.title, font.bold, W * 0.88, 150, 60);
    const baseline = 118 + 26 + size * 0.85;
    ctx.font = font.bold(size);
    ctx.shadowColor = theme.glow; ctx.shadowBlur = 42; ctx.shadowOffsetY = 0;
    ctx.fillStyle = theme.text; ctx.fillText(theme.title, W / 2, baseline);
    ctx.shadowColor = theme.shadow; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
    ctx.fillText(theme.title, W / 2, baseline);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // soft highlight on the upper half of the letters
    ctx.save();
    ctx.beginPath(); ctx.rect(0, baseline - size, W, size * 0.42); ctx.clip();
    ctx.font = font.bold(size); ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(theme.title, W / 2, baseline);
    ctx.restore();

    // ── ornament + owner name ──
    const orn = baseline + 38;
    ornament(ctx, W / 2, orn, theme.accent);

    if (info.name) {
        const label = String(info.name).slice(0, 34);
        const nSize = fitSize(ctx, label, font.medium, W * 0.74, 58, 28);
        ctx.font = font.medium(nSize); ctx.fillStyle = theme.text;
        ctx.shadowColor = theme.shadow; ctx.shadowBlur = 22; ctx.shadowOffsetY = 4;
        ctx.fillText(label, W / 2, orn + 22 + nSize * 0.9);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }

    // ── time chip ──
    if (info.time) {
        ctx.font = font.bold(30);
        const timeW = ctx.measureText(info.time).width;
        ctx.font = font.medium(24);
        const dateText = [info.date, info.zone].filter(Boolean).join('   ·   ');
        const dateW = ctx.measureText(dateText).width;
        const cw = Math.min(W - 120, timeW + dateW + 100); const ch = 58;
        const cx = (W - cw) / 2; const cy = H - 92;
        roundRectPath(ctx, cx, cy, cw, ch, 29);
        ctx.fillStyle = 'rgba(8,10,30,0.52)'; ctx.fill();
        ctx.strokeStyle = theme.accent; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = font.bold(30); ctx.fillStyle = '#fff'; ctx.fillText(info.time, cx + 30, cy + ch / 2 + 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(cx + 30 + timeW + 20, cy + 15, 2, ch - 30);
        ctx.font = font.medium(24); ctx.fillStyle = 'rgba(255,255,255,0.93)'; ctx.fillText(dateText, cx + 30 + timeW + 40, cy + ch / 2 + 2);
    }

    vignette(ctx, W, H, 0.28);
    grain(ctx, W, H, 0.025, 9);
    return encode(c, 'jpeg', 92);
}

module.exports = { renderGreetingCard, THEMES };
                                                                                           
