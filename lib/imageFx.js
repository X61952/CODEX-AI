'use strict';

/**
 * Local image effects for the `image` category (no web APIs involved).
 * Every function takes a normalized image Buffer and returns a Buffer.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const sharp = require('sharp');
const {
    font, createCanvas, loadImage, fitSize, drawSpaced, drawCover, roundRectPath, vignette, grain, rng, encode, codedError,
} = require('./imageKit');
const { getTempDir } = require('../utils/tempManager');

const mix = (a, b, t) => Math.round(a + (b - a) * t);
const shade = ([r, g, b], target, t) => `rgb(${mix(r, target, t)},${mix(g, target, t)},${mix(b, target, t)})`;

async function loadBuffer(buffer) {
    return loadImage(buffer);
}

/** Scales (w,h) so the longer side is at most `max`. */
function fitDims(w, h, max) {
    const s = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(2, Math.round(w * s)), h: Math.max(2, Math.round(h * s)) };
}

// ─── Upscale (remini / hd) ──────────────────────────────────────────────────
const UPSCALE_MAX_SIDE = 4096;

async function upscale(buffer, scale = 2) {
    const meta = await sharp(buffer).metadata();
    let s = Math.min(4, Math.max(2, Number(scale) || 2));
    while (s > 1 && Math.max(meta.width, meta.height) * s > UPSCALE_MAX_SIDE) s -= 1;
    if (s <= 1) throw codedError('BAD_INPUT', 'That image is already at the maximum supported size.');

    const width = Math.round(meta.width * s);
    const height = Math.round(meta.height * s);
    const out = await sharp(buffer)
        .median(3)                                        // soften JPEG blockiness before enlarging
        .resize(width, height, { kernel: 'lanczos3' })
        .sharpen({ sigma: 1.1, m1: 0.9, m2: 2.4 })        // recover edge detail
        .modulate({ saturation: 1.06 })
        .jpeg({ quality: 94, mozjpeg: true })
        .toBuffer();
    return { buffer: out, width, height, scale: s };
}

// ─── Invert ─────────────────────────────────────────────────────────────────
async function invert(buffer) {
    return sharp(buffer).negate({ alpha: false }).jpeg({ quality: 92 }).toBuffer();
}

// ─── Jail ───────────────────────────────────────────────────────────────────
async function jail(buffer) {
    const graded = await sharp(buffer).modulate({ saturation: 0.3, brightness: 0.8 }).png().toBuffer();
    const img = await loadBuffer(graded);
    const { w, h } = fitDims(img.width, img.height, 1080);
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    drawCover(ctx, img, 0, 0, w, h);

    // cold prison lighting
    ctx.fillStyle = 'rgba(8,16,34,0.34)'; ctx.fillRect(0, 0, w, h);
    const beam = ctx.createLinearGradient(w * 0.15, 0, w * 0.75, h);
    beam.addColorStop(0, 'rgba(255,255,255,0.22)'); beam.addColorStop(0.5, 'rgba(255,255,255,0.04)'); beam.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = beam; ctx.fillRect(0, 0, w, h);
    vignette(ctx, w, h, 0.6);

    const beamH = Math.round(h * 0.075);
    const barW = Math.max(16, Math.round(w * 0.034));
    const count = Math.max(5, Math.round(w / (barW * 3.6)));
    const gap = (w - count * barW) / (count + 1);

    const barGrad = (x) => {
        const g = ctx.createLinearGradient(x, 0, x + barW, 0);
        [[0, '#141416'], [0.16, '#494c52'], [0.38, '#d3d8de'], [0.52, '#8b9199'], [0.8, '#34373c'], [1, '#101012']].forEach(([o, col]) => g.addColorStop(o, col));
        return g;
    };

    // bars, each casting a soft shadow onto the picture
    for (let i = 0; i < count; i++) {
        const x = gap + i * (barW + gap);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = barW * 0.9; ctx.shadowOffsetX = barW * 0.6; ctx.shadowOffsetY = 0;
        ctx.fillStyle = barGrad(x);
        ctx.fillRect(x, 0, barW, h);
        ctx.restore();
        ctx.fillStyle = barGrad(x); ctx.fillRect(x, 0, barW, h);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + barW * 0.36, 0, Math.max(2, barW * 0.1), h);   // specular line
    }

    // top and bottom beams
    const beamGrad = (y) => {
        const g = ctx.createLinearGradient(0, y, 0, y + beamH);
        [[0, '#232529'], [0.28, '#b4bac2'], [0.55, '#6a7078'], [1, '#17181b']].forEach(([o, col]) => g.addColorStop(o, col));
        return g;
    };
    for (const y of [0, h - beamH]) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = y === 0 ? 10 : -10;
        ctx.fillStyle = beamGrad(y); ctx.fillRect(0, y, w, beamH);
        ctx.restore();
        ctx.fillStyle = beamGrad(y); ctx.fillRect(0, y, w, beamH);
    }

    // rivets where bars meet the beams
    const rivet = (x, y, r) => {
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        g.addColorStop(0, '#f2f4f7'); g.addColorStop(0.5, '#8a9098'); g.addColorStop(1, '#2a2c30');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    for (let i = 0; i < count; i++) {
        const x = gap + i * (barW + gap) + barW / 2;
        rivet(x, beamH / 2, barW * 0.3);
        rivet(x, h - beamH / 2, barW * 0.3);
    }

    // inmate plate
    const pw = Math.min(w * 0.46, 420); const ph = Math.max(54, pw * 0.2);
    const px = (w - pw) / 2; const py = h - beamH - ph - h * 0.035;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    roundRectPath(ctx, px, py, pw, ph, 10); ctx.fillStyle = '#e9e4d2'; ctx.fill();
    ctx.restore();
    roundRectPath(ctx, px, py, pw, ph, 10); ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#c1121f'; ctx.fillRect(px + 10, py + 10, 10, ph - 20);
    ctx.fillStyle = '#1b1b1b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font.monoBold(Math.round(ph * 0.3));
    ctx.fillText('INMATE', px + pw / 2 + 8, py + ph * 0.32);
    const number = `No. ${String(10000 + Math.floor(Math.random() * 89999))}`;
    ctx.font = font.monoBold(Math.round(ph * 0.34));
    ctx.fillText(number, px + pw / 2 + 8, py + ph * 0.7);

    grain(ctx, w, h, 0.05, 3);
    return encode(c, 'jpeg', 92);
}

// ─── Wanted poster ──────────────────────────────────────────────────────────
async function wantedPoster(buffer) {
    const W = 900; const H = 1320;
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');

    // parchment
    const base = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, H * 0.72);
    base.addColorStop(0, '#e8cf98'); base.addColorStop(0.7, '#d2b073'); base.addColorStop(1, '#a87d44');
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    const r = rng(41);
    for (let i = 0; i < 28; i++) {
        const x = r() * W; const y = r() * H; const rad = 60 + r() * 190;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(120,76,30,${0.05 + r() * 0.08})`); g.addColorStop(1, 'rgba(120,76,30,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < 420; i++) {
        ctx.strokeStyle = `rgba(90,55,20,${0.04 + r() * 0.07})`;
        const x = r() * W; const y = r() * H;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 70, y + (r() - 0.5) * 70); ctx.stroke();
    }
    grain(ctx, W, H, 0.07, 5);

    // burnt edges
    const burn = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.78);
    burn.addColorStop(0, 'rgba(60,30,8,0)'); burn.addColorStop(1, 'rgba(60,30,8,0.7)');
    ctx.fillStyle = burn; ctx.fillRect(0, 0, W, H);

    // borders
    ctx.strokeStyle = '#3a200c'; ctx.lineWidth = 8; ctx.strokeRect(46, 46, W - 92, H - 92);
    ctx.lineWidth = 2; ctx.strokeRect(62, 62, W - 124, H - 124);

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const ink = '#3a200c';

    // title
    const tSize = fitSize(ctx, 'WANTED', font.serif, W - 170, 210, 80);
    ctx.font = font.serif(tSize);
    ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.fillText('WANTED', W / 2 + 3, 232 + 3);
    ctx.fillStyle = ink; ctx.fillText('WANTED', W / 2, 232);

    // photo
    const img = await loadBuffer(await sharp(buffer).grayscale().linear(1.12, -10).png().toBuffer());
    const ps = 590; const px = (W - ps) / 2; const py = 282;
    ctx.save();
    ctx.shadowColor = 'rgba(30,15,0,0.55)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#2a1608'; ctx.fillRect(px - 20, py - 20, ps + 40, ps + 40);
    ctx.restore();
    drawCover(ctx, img, px, py, ps, ps);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(176,122,62,0.78)'; ctx.fillRect(px, py, ps, ps);
    ctx.globalCompositeOperation = 'source-over';
    const pv = ctx.createRadialGradient(W / 2, py + ps / 2, ps * 0.3, W / 2, py + ps / 2, ps * 0.75);
    pv.addColorStop(0, 'rgba(40,20,0,0)'); pv.addColorStop(1, 'rgba(40,20,0,0.45)');
    ctx.fillStyle = pv; ctx.fillRect(px, py, ps, ps);
    ctx.strokeStyle = '#e8cf98'; ctx.lineWidth = 3; ctx.strokeRect(px - 8, py - 8, ps + 16, ps + 16);

    // text below
    ctx.fillStyle = ink;
    const dSize = fitSize(ctx, 'DEAD OR ALIVE', font.serif, W - 170, 92, 40);
    ctx.font = font.serif(dSize); ctx.fillText('DEAD OR ALIVE', W / 2, py + ps + 118);
    ctx.font = font.serif(44); drawSpaced(ctx, 'REWARD', W / 2, py + ps + 180, 18);
    const money = '$ 5,000,000';
    const mSize = fitSize(ctx, money, font.serif, W - 240, 112, 50);
    ctx.font = font.serif(mSize); ctx.fillText(money, W / 2, py + ps + 184 + mSize * 0.98);
    ctx.font = font.medium(26); ctx.fillStyle = 'rgba(58,32,12,0.85)';
    drawSpaced(ctx, 'BY ORDER OF CODEX AI', W / 2, H - 86, 8);

    return encode(c, 'jpeg', 92);
}

// ─── Rainbow ────────────────────────────────────────────────────────────────
async function rainbow(buffer) {
    const img = await loadBuffer(buffer);
    const { w, h } = fitDims(img.width, img.height, 1080);
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    drawCover(ctx, img, 0, 0, w, h);

    const g = ctx.createLinearGradient(0, 0, w, h);
    ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#00b0ff', '#5e35ff', '#d500f9', '#ff1744'].forEach((col, i, arr) => g.addColorStop(i / (arr.length - 1), col));
    ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = 0.6; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.4; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    return encode(c, 'jpeg', 92);
}

// ─── Triggered (animated) ───────────────────────────────────────────────────
function ffmpegPath() {
    for (const mod of ['ffmpeg-static', '@ffmpeg-installer/ffmpeg']) {
        try {
            const m = require(mod);
            const p = typeof m === 'string' ? m : m?.path;
            if (p && fs.existsSync(p)) return p;
        } catch { /* try next */ }
    }
    return 'ffmpeg';
}

function drawTriggeredFrame(img, w, h, rand) {
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    const zoom = 1.2; const dx = (rand() - 0.5) * 22; const dy = (rand() - 0.5) * 22;
    const dw = w * zoom; const dh = h * zoom;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    drawCover(ctx, img, (w - dw) / 2 + dx, (h - dh) / 2 + dy, dw, dh);
    ctx.restore();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(255,70,70,0.55)'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = 'rgba(255,0,0,0.35)'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    const barH = Math.round(h * 0.17);
    const bx = (rand() - 0.5) * 8; const by = (rand() - 0.5) * 8;
    ctx.fillStyle = '#e1061f'; ctx.fillRect(bx, h - barH + by, w, barH + 12);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(bx, h - barH + by, w, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = fitSize(ctx, 'TRIGGERED', font.boldItalic, w * 0.86, Math.round(barH * 0.8), 18);
    ctx.font = font.boldItalic(size);
    ctx.fillStyle = '#fff'; ctx.fillText('TRIGGERED', w / 2 + bx + (rand() - 0.5) * 6, h - barH / 2 + by + 3);
    return c;
}

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        execFile(ffmpegPath(), args, { timeout: 60000, maxBuffer: 20 * 1024 * 1024 }, (err, _out, stderr) => {
            if (err) reject(new Error(`ffmpeg failed: ${String(stderr || err.message).split('\n').slice(-3).join(' ')}`));
            else resolve();
        });
    });
}

/** Returns { video: Buffer|null, still: Buffer }. `video` is an mp4 to send as a gif. */
async function triggered(buffer) {
    const img = await loadBuffer(buffer);
    const { w: rw, h: rh } = fitDims(img.width, img.height, 512);
    const w = rw - (rw % 2); const h = rh - (rh % 2);
    const rand = rng(Date.now() & 0xffff);

    const still = drawTriggeredFrame(img, w, h, rng(3)).toBuffer('image/jpeg', 90);

    const dir = fs.mkdtempSync(path.join(getTempDir(), 'trg_'));
    try {
        const FRAMES = 14;
        for (let i = 0; i < FRAMES; i++) {
            fs.writeFileSync(path.join(dir, `f${String(i).padStart(2, '0')}.png`), drawTriggeredFrame(img, w, h, rand).toBuffer('image/png'));
        }
        const out = path.join(dir, 'out.mp4');
        await runFfmpeg([
            '-y', '-framerate', '18', '-i', path.join(dir, 'f%02d.png'),
            '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
            '-movflags', '+faststart', out,
        ]);
        return { video: fs.readFileSync(out), still };
    } catch (err) {
        console.warn('[image] triggered animation failed, sending still:', err.message);
        return { video: null, still };
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
}

// ─── RIP ────────────────────────────────────────────────────────────────────
async function rip(buffer) {
    const W = 900; const H = 1200;
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');

    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.75);
    sky.addColorStop(0, '#0f1424'); sky.addColorStop(1, '#3a4766');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const r = rng(17);
    for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; ctx.fillRect(r() * W, r() * H * 0.5, 2, 2); }

    // moon
    const mg = ctx.createRadialGradient(720, 160, 10, 720, 160, 150);
    mg.addColorStop(0, 'rgba(255,248,220,0.95)'); mg.addColorStop(0.3, 'rgba(255,248,220,0.35)'); mg.addColorStop(1, 'rgba(255,248,220,0)');
    ctx.fillStyle = mg; ctx.fillRect(520, 0, 380, 340);
    ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.arc(720, 160, 58, 0, Math.PI * 2); ctx.fill();

    // ground
    const ground = ctx.createLinearGradient(0, 860, 0, H);
    ground.addColorStop(0, '#1c2b22'); ground.addColorStop(1, '#050806');
    ctx.fillStyle = ground; ctx.fillRect(0, 880, W, H - 880);
    ctx.fillStyle = '#16231b';
    for (let x = 0; x < W; x += 14) { const hh = 14 + r() * 26; ctx.beginPath(); ctx.moveTo(x, 884); ctx.lineTo(x + 7, 884 - hh); ctx.lineTo(x + 14, 884); ctx.fill(); }

    // tombstone
    const left = 170; const right = 730; const top = 250; const bottom = 975; const archR = (right - left) / 2;
    const stone = () => {
        ctx.beginPath();
        ctx.moveTo(left, bottom); ctx.lineTo(left, top + archR);
        ctx.arc(W / 2, top + archR, archR, Math.PI, 0);
        ctx.lineTo(right, bottom); ctx.closePath();
    };
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 22;
    stone(); ctx.fillStyle = '#777d86'; ctx.fill(); ctx.restore();
    const sg = ctx.createLinearGradient(left, 0, right, 0);
    [[0, '#6b7079'], [0.35, '#c4c9cf'], [0.65, '#9aa0a8'], [1, '#5d626a']].forEach(([o, col]) => sg.addColorStop(o, col));
    stone(); ctx.fillStyle = sg; ctx.fill();
    ctx.save(); stone(); ctx.clip();
    for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.05)`; ctx.fillRect(left + r() * (right - left), top + r() * (bottom - top), 2, 2); }
    ctx.strokeStyle = 'rgba(30,32,36,0.5)'; ctx.lineWidth = 2;
    for (const [x, y] of [[560, 700], [250, 820]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 24, y + 38); ctx.lineTo(x + 6, y + 76); ctx.lineTo(x + 34, y + 120); ctx.stroke(); }
    ctx.fillStyle = 'rgba(60,92,58,0.35)';
    for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.arc(left + r() * 120, bottom - r() * 160, 6 + r() * 16, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    stone(); ctx.strokeStyle = 'rgba(25,27,31,0.8)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.save(); ctx.translate(8, 8); stone(); ctx.restore();

    // base slab
    const slab = ctx.createLinearGradient(0, bottom - 6, 0, bottom + 50);
    slab.addColorStop(0, '#5a5f67'); slab.addColorStop(1, '#2a2d32');
    ctx.fillStyle = slab; ctx.fillRect(left - 36, bottom - 6, right - left + 72, 56);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(left - 36, bottom - 6, right - left + 72, 56);

    // photo medallion
    const img = await loadBuffer(await sharp(buffer).grayscale().linear(1.05, -6).png().toBuffer());
    const pcx = W / 2; const pcy = 505; const pr = 150;
    ctx.save(); ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, Math.PI * 2); ctx.clip();
    drawCover(ctx, img, pcx - pr, pcy - pr, pr * 2, pr * 2);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(150,158,170,0.55)'; ctx.fillRect(pcx - pr, pcy - pr, pr * 2, pr * 2);
    ctx.restore();
    ctx.lineWidth = 16; ctx.strokeStyle = '#2f343b'; ctx.beginPath(); ctx.arc(pcx, pcy, pr + 8, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#d9dde2'; ctx.beginPath(); ctx.arc(pcx, pcy, pr - 1, 0, Math.PI * 2); ctx.stroke();

    // engraved text
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const engrave = (text, y, fontStr) => {
        ctx.font = fontStr;
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(text, W / 2 + 2, y + 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(text, W / 2 - 1, y - 1);
        ctx.fillStyle = '#4a4f57'; ctx.fillText(text, W / 2, y);
    };
    engrave('R.I.P', 810, font.serif(124));
    engrave('REST IN PEACE', 872, font.serif(36));
    engrave('Gone but never forgotten', 928, font.medium(28));

    // flowers
    for (const [x, y, col] of [[120, 1000, '#d62839'], [150, 1018, '#ffbe0b'], [175, 1004, '#d62839'], [725, 1004, '#ff5d8f'], [755, 1018, '#ffbe0b'], [785, 1000, '#ff5d8f']]) {
        ctx.fillStyle = '#1f6f3a'; ctx.fillRect(x - 2, y, 4, 34);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    }

    // fog + vignette
    for (let i = 0; i < 6; i++) {
        const fx = r() * W; const fy = 930 + r() * 120;
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 260);
        g.addColorStop(0, 'rgba(210,225,240,0.16)'); g.addColorStop(1, 'rgba(210,225,240,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 760, W, 440);
    }
    vignette(ctx, W, H, 0.6);
    return encode(c, 'jpeg', 92);
}

// ─── M&M candy mosaic ───────────────────────────────────────────────────────
async function mnm(buffer) {
    const meta = await sharp(buffer).metadata();
    const cols = 46;
    const rows = Math.min(72, Math.max(10, Math.round(cols * (meta.height / meta.width))));
    const { data, info } = await sharp(buffer)
        .flatten({ background: '#ffffff' })
        .resize(cols, rows, { fit: 'fill', kernel: 'lanczos3' })
        .modulate({ saturation: 1.25 })
        .removeAlpha().raw().toBuffer({ resolveWithObject: true });

    const cell = 22; const pad = cell;
    const c = createCanvas(info.width * cell + pad * 2, info.height * cell + pad * 2);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5ecdc'; ctx.fillRect(0, 0, c.width, c.height);
    const r = rng(99);
    const rad = cell * 0.47;

    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            const i = (y * info.width + x) * 3;
            const col = [data[i], data[i + 1], data[i + 2]];
            const cx = pad + x * cell + cell / 2; const cy = pad + y * cell + cell / 2;

            ctx.fillStyle = 'rgba(60,40,10,0.22)';
            ctx.beginPath(); ctx.ellipse(cx + 2.5, cy + 3.5, rad, rad * 0.92, 0, 0, Math.PI * 2); ctx.fill();

            const g = ctx.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.1, cx, cy, rad);
            g.addColorStop(0, shade(col, 255, 0.5)); g.addColorStop(0.55, `rgb(${col[0]},${col[1]},${col[2]})`); g.addColorStop(1, shade(col, 0, 0.35));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.beginPath(); ctx.ellipse(cx - rad * 0.38, cy - rad * 0.45, rad * 0.22, rad * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();

            if (r() < 0.32) {
                ctx.save(); ctx.translate(cx, cy); ctx.rotate((r() - 0.5) * 1.2);
                ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = font.bold(Math.round(cell * 0.62));
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('m', 0, 1);
                ctx.restore();
            }
        }
    }
    return encode(c, 'jpeg', 92);
}

// ─── Wasted (GTA death screen) ──────────────────────────────────────────────
async function wasted(buffer) {
    const gray = await sharp(buffer).grayscale().modulate({ brightness: 0.82 }).linear(1.15, -12).png().toBuffer();
    const img = await loadBuffer(gray);
    const { w, h } = fitDims(img.width, img.height, 1080);
    const c = createCanvas(w, h);
    const ctx = c.getContext('2d');
    drawCover(ctx, img, 0, 0, w, h);

    // darken + heavy vignette, like the in-game death screen
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, 0, w, h);
    vignette(ctx, w, h, 0.75);

    // black band across the middle
    const bandH = Math.max(90, Math.round(h * 0.21));
    const bandY = Math.round((h - bandH) / 2);
    const band = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(0.18, 'rgba(0,0,0,0.78)');
    band.addColorStop(0.82, 'rgba(0,0,0,0.78)');
    band.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = band; ctx.fillRect(0, bandY - 6, w, bandH + 12);

    // red WASTED text
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    const size = fitSize(ctx, 'wasted', font.bold, w * 0.7, Math.round(bandH * 0.95), 30);
    ctx.font = font.bold(size);
    const y = Math.round(h / 2 + size * 0.34);
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#7a0a14'; ctx.fillText('wasted', w / 2 + 3, y + 4);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(40,0,4,0.85)'; ctx.lineWidth = Math.max(4, size * 0.05); ctx.strokeText('wasted', w / 2, y);
    const g = ctx.createLinearGradient(0, y - size * 0.75, 0, y);
    g.addColorStop(0, '#ff3b3b'); g.addColorStop(1, '#c1121f');
    ctx.fillStyle = g; ctx.fillText('wasted', w / 2, y);

    grain(ctx, w, h, 0.05, 13);
    return encode(c, 'jpeg', 92);
}

// ─── Carbon (code screenshot) ───────────────────────────────────────────────
const KEYWORDS = new Set((
    'const let var function return if else elif for while do switch case break continue new class extends import from export default ' +
    'require async await try catch finally throw typeof instanceof in of yield static public private protected interface enum type ' +
    'def lambda pass with as is not and or print self this super void int float double bool string char long short struct fn mut use mod ' +
    'impl pub match loop echo foreach package func go defer select chan null nil None undefined true false True False'
).split(' '));

const THEME = {
    kw: '#c678dd', str: '#98c379', num: '#d19a66', com: '#6b7385', fn: '#61afef', cls: '#e5c07b', pun: '#9aa5b8', id: '#e6e9ef',
};

const TOKEN_RE = /(\/\/.*|^\s*#.*|\/\*.*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z0-9_$])/g;

function tokenize(line) {
    const tokens = [];
    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(line)) !== null) {
        if (m[0] === '') { TOKEN_RE.lastIndex++; continue; }
        if (m[1]) tokens.push(['com', m[1]]);
        else if (m[2]) tokens.push(['str', m[2]]);
        else if (m[3]) tokens.push(['num', m[3]]);
        else if (m[4]) {
            const next = line[TOKEN_RE.lastIndex];
            if (KEYWORDS.has(m[4])) tokens.push(['kw', m[4]]);
            else if (next === '(') tokens.push(['fn', m[4]]);
            else if (/^[A-Z]/.test(m[4])) tokens.push(['cls', m[4]]);
            else tokens.push(['id', m[4]]);
        } else if (m[5]) tokens.push(['ws', m[5]]);
        else tokens.push(['pun', m[6]]);
    }
    return tokens;
}

function carbon(code) {
    const MAX_LINES = 45; const MAX_COLS = 110;
    let lines = String(code).replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    while (lines.length && !lines[0].trim()) lines.shift();
    if (!lines.length) throw codedError('BAD_INPUT', 'No code to render.');
    const truncated = lines.length > MAX_LINES;
    lines = lines.slice(0, MAX_LINES).map(l => (l.length > MAX_COLS ? l.slice(0, MAX_COLS - 1) + '…' : l));
    if (truncated) lines.push('…');

    const fontSize = 28; const lineH = 44; const padX = 46; const outer = 84; const bar = 70;
    const probe = createCanvas(10, 10).getContext('2d');
    probe.font = font.mono(fontSize);
    const charW = probe.measureText('M').width;
    const gutter = String(lines.length).length * charW + 34;
    const codeW = Math.max(...lines.map(l => l.length)) * charW;
    const winW = Math.max(620, Math.ceil(gutter + codeW + padX * 2));
    const winH = bar + lines.length * lineH + 52;
    const W = winW + outer * 2; const H = winH + outer * 2;

    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#8e44ff'); bg.addColorStop(0.55, '#4f6bff'); bg.addColorStop(1, '#15c2d0');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.shadowColor = 'rgba(8,10,30,0.6)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 28;
    roundRectPath(ctx, outer, outer, winW, winH, 22); ctx.fillStyle = '#1b1e2b'; ctx.fill();
    ctx.restore();
    roundRectPath(ctx, outer, outer, winW, winH, 22); ctx.fillStyle = '#1b1e2b'; ctx.fill();
    ctx.save(); roundRectPath(ctx, outer, outer, winW, winH, 22); ctx.clip();
    ctx.fillStyle = '#232738'; ctx.fillRect(outer, outer, winW, bar - 6);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; roundRectPath(ctx, outer, outer, winW, winH, 22); ctx.stroke();
    for (const [i, col] of ['#ff5f56', '#ffbd2e', '#27c93f'].entries()) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(outer + 40 + i * 36, outer + 32, 11, 0, Math.PI * 2); ctx.fill();
    }

    ctx.font = font.mono(fontSize); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    lines.forEach((line, idx) => {
        const y = outer + bar + 8 + idx * lineH + 30;
        ctx.fillStyle = '#4a5068'; ctx.textAlign = 'right';
        ctx.fillText(String(idx + 1), outer + padX + gutter - 34, y);
        ctx.textAlign = 'left';
        let x = outer + padX + gutter;
        for (const [type, text] of tokenize(line)) {
            if (type !== 'ws') { ctx.fillStyle = THEME[type] || THEME.id; ctx.fillText(text, x, y); }
            x += text.length * charW;
        }
    });
    return encode(c, 'png');
}

module.exports = { upscale, invert, jail, wantedPoster, rainbow, triggered, rip, mnm, wasted, carbon };
                                       
