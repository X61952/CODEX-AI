'use strict';

/**
 * The twelve gfx styles (1280x720). Every renderer takes the text parts and
 * returns a PNG buffer.
 *
 *   two-text styles    gfx1 gfx2 gfx3 gfx4 gfx7 gfx8    "small;BIG"
 *   three-text styles  gfx5 gfx6                         "top;BIG;bottom"
 *   one-text styles    gfx9 gfx10 gfx11 gfx12            "TEXT"
 */

const {
    font, createCanvas, fitSize, drawSpaced, spacedWidth, vignette, grain, sparkle, rng, roundRectPath, encode,
} = require('./imageKit');

const W = 1280;
const H = 720;
const up = s => String(s || '').toUpperCase();

function canvas() {
    const c = createCanvas(W, H);
    return { c, ctx: c.getContext('2d') };
}

function radialBg(ctx, stops, cx = W / 2, cy = H / 2, r = W * 0.75) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

function linearBg(ctx, stops, x0 = 0, y0 = 0, x1 = 0, y1 = H) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

/** Fit `text` and return the size used (also leaves ctx.font set). */
function fit(ctx, text, fontFn, maxW, start, min = 40) {
    return fitSize(ctx, text, fontFn, maxW, start, min);
}

// ─── 1. NEON ────────────────────────────────────────────────────────────────
function neon([small, name]) {
    const { c, ctx } = canvas();
    radialBg(ctx, [[0, '#35105e'], [0.55, '#12062b'], [1, '#05010d']]);

    // perspective floor
    ctx.save();
    ctx.beginPath(); ctx.rect(0, H * 0.66, W, H * 0.34); ctx.clip();
    ctx.strokeStyle = 'rgba(255,43,214,0.35)'; ctx.lineWidth = 2;
    for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 40, H * 0.66); ctx.lineTo(W / 2 + i * 190, H); ctx.stroke(); }
    for (let i = 0; i < 9; i++) { const y = H * 0.66 + Math.pow(i / 8, 2) * H * 0.34; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();

    // double tube frame
    ctx.save();
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 28; ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 6;
    roundRectPath(ctx, 38, 38, W - 76, H - 76, 34); ctx.stroke();
    ctx.shadowColor = '#ff2bd6'; ctx.strokeStyle = '#ff7be8'; ctx.lineWidth = 3;
    roundRectPath(ctx, 62, 62, W - 124, H - 124, 22); ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (small) {
        ctx.font = font.medium(54);
        ctx.fillStyle = '#9ffcff'; ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 24;
        drawSpaced(ctx, up(small), W / 2, 270, 14);
    }
    const size = fit(ctx, up(name), font.bold, W * 0.8, 230);
    ctx.font = font.bold(size);
    const y = small ? 450 : 410;
    for (const [blur, col] of [[90, '#ff2bd6'], [48, '#ff2bd6'], [18, '#ff9cf0']]) {
        ctx.shadowColor = col; ctx.shadowBlur = blur; ctx.fillStyle = col;
        ctx.fillText(up(name), W / 2, y);
    }
    ctx.shadowBlur = 0; ctx.fillStyle = '#ffe9fb'; ctx.fillText(up(name), W / 2, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.strokeText(up(name), W / 2, y);

    // underline glow
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 20; ctx.fillStyle = '#7df9ff';
    ctx.fillRect(W / 2 - 220, y + 56, 440, 6);
    vignette(ctx, W, H, 0.45);
    return encode(c);
}

// ─── 2. GOLD LUXURY ─────────────────────────────────────────────────────────
function gold([small, name]) {
    const { c, ctx } = canvas();
    radialBg(ctx, [[0, '#2a210c'], [0.6, '#0e0b04'], [1, '#030201']]);

    const goldGrad = (y0, y1) => {
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        [[0, '#fff6c4'], [0.35, '#f7d154'], [0.55, '#b8860b'], [0.8, '#f2c94c'], [1, '#8a6410']].forEach(([o, col]) => g.addColorStop(o, col));
        return g;
    };

    // frame + corner diamonds
    ctx.strokeStyle = goldGrad(0, H); ctx.lineWidth = 5; ctx.strokeRect(46, 46, W - 92, H - 92);
    ctx.lineWidth = 1.5; ctx.strokeRect(64, 64, W - 128, H - 128);
    ctx.fillStyle = goldGrad(0, H);
    for (const [x, y] of [[46, 46], [W - 46, 46], [46, H - 46], [W - 46, H - 46]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-11, -11, 22, 22); ctx.restore();
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (small) {
        ctx.font = font.medium(46); ctx.fillStyle = goldGrad(190, 250);
        const w = drawSpaced(ctx, up(small), W / 2, 250, 16);
        ctx.fillRect(W / 2 - w / 2 - 190, 236, 150, 3);
        ctx.fillRect(W / 2 + w / 2 + 40, 236, 150, 3);
    }
    const size = fit(ctx, up(name), font.bold, W * 0.78, 210);
    ctx.font = font.bold(size);
    const y = small ? 450 : 410;
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#000'; ctx.fillText(up(name), W / 2, y);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = goldGrad(y - size * 0.75, y);
    ctx.fillText(up(name), W / 2, y);
    ctx.strokeStyle = 'rgba(70,40,0,0.9)'; ctx.lineWidth = 3; ctx.strokeText(up(name), W / 2, y);
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.save();
    ctx.beginPath(); ctx.rect(0, y - size * 0.78, W, size * 0.22); ctx.clip(); ctx.fillText(up(name), W / 2, y); ctx.restore();

    const r = rng(11);
    for (let i = 0; i < 16; i++) sparkle(ctx, 120 + r() * (W - 240), 110 + r() * (H - 220), 5 + r() * 9, '#ffe9a0');
    vignette(ctx, W, H, 0.5);
    return encode(c);
}

// ─── 3. FIRE ESPORTS ────────────────────────────────────────────────────────
function fire([small, name]) {
    const { c, ctx } = canvas();
    radialBg(ctx, [[0, '#5a0b0b'], [0.6, '#1d0404'], [1, '#050101']], W / 2, H * 0.65);

    ctx.fillStyle = 'rgba(160,20,20,0.22)';
    for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        const x = -200 + i * 230;
        ctx.moveTo(x, H); ctx.lineTo(x + 130, H); ctx.lineTo(x + 430, 0); ctx.lineTo(x + 300, 0); ctx.closePath(); ctx.fill();
    }

    const r = rng(5);
    for (let i = 0; i < 70; i++) {
        const x = r() * W; const y = H * 0.35 + r() * H * 0.65; const rad = 1.5 + r() * 4;
        ctx.fillStyle = `rgba(255,${120 + Math.floor(r() * 100)},30,${0.35 + r() * 0.5})`;
        ctx.shadowColor = '#ff7a18'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const size = fit(ctx, up(name), font.boldItalic, W * 0.82, 220);
    ctx.font = font.boldItalic(size);
    const y = small ? 460 : 410;
    ctx.shadowColor = '#ff5a00'; ctx.shadowBlur = 70; ctx.fillStyle = '#ff5a00'; ctx.fillText(up(name), W / 2, y);
    ctx.shadowBlur = 0;
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#120000'; ctx.lineWidth = 16; ctx.strokeText(up(name), W / 2, y);
    const g = ctx.createLinearGradient(0, y - size * 0.8, 0, y);
    [[0, '#fff3a0'], [0.4, '#ffb52e'], [0.75, '#ff5a1f'], [1, '#c4160a']].forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g; ctx.fillText(up(name), W / 2, y);
    ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 2; ctx.strokeText(up(name), W / 2, y);

    if (small) {
        ctx.font = font.boldItalic(44);
        const w = spacedWidth(ctx, up(small), 8);
        const bx = W / 2 - w / 2 - 34; const by = 175;
        ctx.save(); ctx.transform(1, 0, -0.25, 1, 0, 0);
        ctx.fillStyle = '#d9141b'; ctx.shadowColor = '#ff2a2a'; ctx.shadowBlur = 24;
        ctx.fillRect(bx + by * 0.25, by, w + 68, 76);
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.shadowBlur = 0;
        drawSpaced(ctx, up(small), W / 2, by + 56, 8);
    }
    vignette(ctx, W, H, 0.55);
    return encode(c);
}

// ─── 4. GLITCH ──────────────────────────────────────────────────────────────
function glitch([small, name]) {
    const { c, ctx } = canvas();
    ctx.fillStyle = '#04060b'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,255,220,0.07)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (small) {
        ctx.font = font.monoBold(44); ctx.fillStyle = '#39ff9c'; ctx.shadowColor = '#39ff9c'; ctx.shadowBlur = 16;
        drawSpaced(ctx, `[ ${up(small)} ]`, W / 2, 255, 10);
        ctx.shadowBlur = 0;
    }
    const size = fit(ctx, up(name), font.bold, W * 0.82, 220);
    ctx.font = font.bold(size);
    const y = small ? 450 : 410;

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#00ffe1'; ctx.fillText(up(name), W / 2 - 9, y);
    ctx.fillStyle = '#ff2bd6'; ctx.fillText(up(name), W / 2 + 9, y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff'; ctx.fillText(up(name), W / 2, y);

    // sliced displacement bands
    const r = rng(21);
    for (let i = 0; i < 7; i++) {
        const sy = y - size * 0.8 + r() * size * 0.9; const sh = 8 + r() * 26; const dx = (r() - 0.5) * 70;
        ctx.drawImage(c, 0, sy, W, sh, dx, sy, W, sh);
    }
    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(0,255,225,0.55)' : 'rgba(255,43,214,0.55)';
        ctx.fillRect(r() * W * 0.6, y - size * 0.8 + r() * size, 120 + r() * 260, 5 + r() * 9);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let yy = 0; yy < H; yy += 4) ctx.fillRect(0, yy, W, 2);
    vignette(ctx, W, H, 0.5);
    return encode(c);
}

// ─── 5. ESPORTS BANNER (3 texts) ────────────────────────────────────────────
function esports([top, name, bottom]) {
    const { c, ctx } = canvas();
    linearBg(ctx, [[0, '#0a0f2c'], [1, '#150a2e']], 0, 0, W, H);
    ctx.fillStyle = '#1b3cff'; ctx.globalAlpha = 0.32;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.62, 0); ctx.lineTo(W * 0.34, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9b1bff'; ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * 0.52, H); ctx.lineTo(W * 0.74, 0); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(W * 0.3 + i * 38, H); ctx.lineTo(W * 0.55 + i * 38, 0); ctx.stroke(); }

    // corner brackets
    ctx.strokeStyle = '#00d9ff'; ctx.lineWidth = 8; ctx.shadowColor = '#00d9ff'; ctx.shadowBlur = 16;
    const L = 90; const m = 46;
    for (const [x, y, dx, dy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
        ctx.beginPath(); ctx.moveTo(x + dx * L, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * L); ctx.stroke();
    }
    ctx.shadowBlur = 0;

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const size = fit(ctx, up(name), font.boldItalic, W * 0.8, 210);
    ctx.font = font.boldItalic(size);
    const y = 420;
    ctx.shadowColor = '#2e5bff'; ctx.shadowBlur = 50; ctx.fillStyle = '#2e5bff'; ctx.fillText(up(name), W / 2, y);
    ctx.shadowBlur = 0; ctx.lineJoin = 'round'; ctx.strokeStyle = '#05061a'; ctx.lineWidth = 18; ctx.strokeText(up(name), W / 2, y);
    ctx.fillStyle = '#ffffff'; ctx.fillText(up(name), W / 2, y);

    const badge = (text, cy, fill, stroke, textCol) => {
        ctx.font = font.boldItalic(40);
        const w = spacedWidth(ctx, up(text), 8) + 80;
        ctx.save();
        ctx.translate(W / 2, cy); ctx.transform(1, 0, -0.25, 1, 0, 0);
        if (fill) { ctx.fillStyle = fill; ctx.shadowColor = fill; ctx.shadowBlur = 22; ctx.fillRect(-w / 2, -34, w, 68); }
        if (stroke) { ctx.shadowBlur = 0; ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.strokeRect(-w / 2, -34, w, 68); }
        ctx.restore();
        ctx.shadowBlur = 0; ctx.fillStyle = textCol;
        drawSpaced(ctx, up(text), W / 2, cy + 14, 8);
    };
    if (top) badge(top, 215, '#00c8ff', null, '#04122b');
    if (bottom) badge(bottom, 545, null, '#ff3df0', '#ffffff');
    vignette(ctx, W, H, 0.45);
    return encode(c);
}

// ─── 6. HOLO CARD (3 texts) ─────────────────────────────────────────────────
function holo([top, name, bottom]) {
    const { c, ctx } = canvas();
    linearBg(ctx, [[0, '#2b1055'], [0.5, '#4a2fbd'], [1, '#0f9fb8']], 0, 0, W, H);
    for (const [x, y, r, col] of [[220, 150, 380, 'rgba(255,90,200,0.55)'], [1060, 580, 420, 'rgba(0,230,255,0.5)'], [700, 80, 300, 'rgba(255,200,80,0.35)']]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    // glass card
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
    roundRectPath(ctx, 130, 110, W - 260, H - 220, 46);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.restore();
    roundRectPath(ctx, 130, 110, W - 260, H - 220, 46);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.save(); roundRectPath(ctx, 130, 110, W - 260, H - 220, 46); ctx.clip();
    const sheen = ctx.createLinearGradient(130, 110, W - 130, 400);
    sheen.addColorStop(0, 'rgba(255,255,255,0.28)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.fillRect(130, 110, W - 260, H - 220); ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (top) { ctx.font = font.medium(44); ctx.fillStyle = 'rgba(255,255,255,0.92)'; drawSpaced(ctx, up(top), W / 2, 235, 14); }
    const size = fit(ctx, up(name), font.bold, W * 0.66, 190);
    ctx.font = font.bold(size);
    const y = 395;
    const g = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
    [[0, '#ff7ad9'], [0.5, '#ffffff'], [1, '#7df9ff']].forEach(([o, col]) => g.addColorStop(o, col));
    ctx.shadowColor = 'rgba(30,0,80,0.55)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 8;
    ctx.fillStyle = g; ctx.fillText(up(name), W / 2, y);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(W / 2 - 150, y + 44, 300, 3);
    if (bottom) { ctx.font = font.medium(40); ctx.fillStyle = 'rgba(255,255,255,0.95)'; drawSpaced(ctx, up(bottom), W / 2, y + 120, 12); }
    return encode(c);
}

// ─── 7. CHROME ICE ──────────────────────────────────────────────────────────
function chrome([small, name]) {
    const { c, ctx } = canvas();
    linearBg(ctx, [[0, '#0b2a5b'], [0.55, '#0a1630'], [1, '#050a16']]);
    ctx.save();
    ctx.translate(W / 2, H * 0.55);
    for (let i = 0; i < 16; i++) {
        ctx.rotate((Math.PI * 2) / 16);
        const g = ctx.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, 'rgba(120,190,255,0.20)'); g.addColorStop(1, 'rgba(120,190,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -46); ctx.lineTo(W, 46); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    if (small) { ctx.font = font.medium(50); ctx.fillStyle = '#bfe2ff'; ctx.shadowColor = '#4aa3ff'; ctx.shadowBlur = 18; drawSpaced(ctx, up(small), W / 2, 255, 16); ctx.shadowBlur = 0; }
    const size = fit(ctx, up(name), font.bold, W * 0.8, 230);
    ctx.font = font.bold(size);
    const y = small ? 450 : 410;

    // reflection
    ctx.save(); ctx.translate(0, y * 2 - size * 0.1); ctx.scale(1, -1); ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#9fc4ff'; ctx.fillText(up(name), W / 2, y); ctx.restore();

    ctx.lineJoin = 'round'; ctx.strokeStyle = '#04122e'; ctx.lineWidth = 20; ctx.strokeText(up(name), W / 2, y);
    const g = ctx.createLinearGradient(0, y - size * 0.78, 0, y);
    [[0, '#ffffff'], [0.38, '#b7cde4'], [0.5, '#2c3d56'], [0.56, '#8fb2d6'], [0.8, '#e8f3ff'], [1, '#ffffff']].forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g; ctx.fillText(up(name), W / 2, y);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.strokeText(up(name), W / 2, y);
    ctx.shadowColor = '#4aa3ff'; ctx.shadowBlur = 30; ctx.strokeStyle = 'rgba(120,190,255,0.5)'; ctx.lineWidth = 2; ctx.strokeText(up(name), W / 2, y);
    ctx.shadowBlur = 0;
    const r = rng(33);
    for (let i = 0; i < 10; i++) sparkle(ctx, W * 0.12 + r() * W * 0.76, y - size * 0.8 + r() * size, 6 + r() * 9, '#e6f4ff');
    vignette(ctx, W, H, 0.5);
    return encode(c);
}

// ─── 8. COMIC POP ───────────────────────────────────────────────────────────
function comic([small, name]) {
    const { c, ctx } = canvas();
    ctx.fillStyle = '#ffd60a'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2);
    for (let i = 0; i < 28; i++) {
        ctx.rotate((Math.PI * 2) / 28);
        ctx.fillStyle = i % 2 ? 'rgba(255,170,0,0.55)' : 'rgba(255,214,10,0)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -60); ctx.lineTo(W, 60); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(230,30,60,0.28)';
    for (let y = 10; y < H; y += 26) for (let x = ((y / 26) % 2) * 13; x < W; x += 26) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }

    ctx.save(); ctx.translate(W / 2, H / 2 + 20); ctx.rotate(-0.06);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    const size = fit(ctx, up(name), font.boldItalic, W * 0.82, 230);
    ctx.font = font.boldItalic(size);
    for (let i = 16; i >= 1; i--) { ctx.fillStyle = '#111'; ctx.fillText(up(name), i * 1.1, 60 + i * 1.1); }
    ctx.strokeStyle = '#111'; ctx.lineWidth = 22; ctx.strokeText(up(name), 0, 60);
    ctx.fillStyle = '#ffffff'; ctx.fillText(up(name), 0, 60);
    ctx.fillStyle = '#e63946';
    ctx.save(); ctx.beginPath(); ctx.rect(-W, 60 - size * 0.4, W * 2, size); ctx.clip(); ctx.globalAlpha = 0.9; ctx.fillText(up(name), 0, 60); ctx.restore();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.strokeText(up(name), 0, 60);

    if (small) {
        ctx.font = font.boldItalic(46);
        const w = spacedWidth(ctx, up(small), 6) + 70;
        ctx.save(); ctx.translate(-w / 2 - 40, -size * 0.98);
        ctx.rotate(-0.05);
        ctx.fillStyle = '#111'; ctx.fillRect(8, 8, w, 74);
        ctx.fillStyle = '#e63946'; ctx.fillRect(0, 0, w, 74);
        ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, w, 74);
        ctx.fillStyle = '#fff'; drawSpaced(ctx, up(small), 35, 56, 6, 'fill', 'left');
        ctx.restore();
    }
    ctx.restore();
    vignette(ctx, W, H, 0.25);
    return encode(c);
}

// ─── 9. 3D EXTRUDE ──────────────────────────────────────────────────────────
function extrude([name]) {
    const { c, ctx } = canvas();
    linearBg(ctx, [[0, '#3a0ca3'], [0.5, '#7209b7'], [1, '#f72585']], 0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(150 + i * 230, 90 + (i % 2) * 520, 120 + i * 12, 0, Math.PI * 2); ctx.fill(); }

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    const size = fit(ctx, up(name), font.bold, W * 0.78, 250);
    ctx.font = font.bold(size);
    const y = 430; const depth = 34;

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(W / 2 + depth, y + depth + 40, W * 0.38, 34, 0, 0, Math.PI * 2); ctx.fill();

    for (let i = depth; i >= 1; i--) {
        const t = i / depth;
        ctx.fillStyle = `rgb(${Math.round(70 + 60 * (1 - t))},${Math.round(8 + 10 * (1 - t))},${Math.round(80 + 60 * (1 - t))})`;
        ctx.fillText(up(name), W / 2 + i, y + i);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 6; ctx.strokeText(up(name), W / 2 + i, y + i);
    }
    const g = ctx.createLinearGradient(0, y - size * 0.8, 0, y);
    [[0, '#fff1a8'], [0.5, '#ffb703'], [1, '#fb5607']].forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g; ctx.fillText(up(name), W / 2, y);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.strokeText(up(name), W / 2, y);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.save(); ctx.beginPath(); ctx.rect(0, y - size * 0.8, W, size * 0.26); ctx.clip(); ctx.fillText(up(name), W / 2, y); ctx.restore();
    vignette(ctx, W, H, 0.4);
    return encode(c);
}

// ─── 10. SYNTHWAVE ──────────────────────────────────────────────────────────
function synthwave([name]) {
    const { c, ctx } = canvas();
    linearBg(ctx, [[0, '#10002b'], [0.5, '#5a189a'], [0.62, '#ff2e93'], [0.64, '#240046'], [1, '#10002b']]);
    const r = rng(9);
    for (let i = 0; i < 70; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; ctx.fillRect(r() * W, r() * H * 0.5, 2, 2); }

    // sun
    const sx = W / 2; const sy = H * 0.5; const sr = 190;
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.clip();
    const sg = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
    sg.addColorStop(0, '#ffe66d'); sg.addColorStop(0.5, '#ff9e00'); sg.addColorStop(1, '#ff0f7b');
    ctx.fillStyle = sg; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
    ctx.fillStyle = '#240046';
    for (let i = 0; i < 8; i++) { const yy = sy + 10 + i * 24; ctx.fillRect(sx - sr, yy, sr * 2, 3 + i * 2.6); }
    ctx.restore();

    // floor
    const horizon = H * 0.64;
    ctx.fillStyle = '#1b0033'; ctx.fillRect(0, horizon, W, H - horizon);
    ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 2; ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = 8;
    for (let i = -18; i <= 18; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 30, horizon); ctx.lineTo(W / 2 + i * 220, H); ctx.stroke(); }
    for (let i = 1; i < 10; i++) { const y = horizon + Math.pow(i / 9, 2.2) * (H - horizon); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.shadowBlur = 0;

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    const size = fit(ctx, up(name), font.boldItalic, W * 0.82, 200);
    ctx.font = font.boldItalic(size);
    const y = 395;
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 36; ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 14; ctx.strokeText(up(name), W / 2 - 5, y + 5);
    ctx.shadowColor = '#ff2bd6'; ctx.strokeStyle = '#ff2bd6'; ctx.strokeText(up(name), W / 2 + 5, y - 3);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(0, y - size * 0.8, 0, y);
    [[0, '#ffffff'], [0.5, '#ffd6f5'], [1, '#ff7be8']].forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g; ctx.fillText(up(name), W / 2, y);
    vignette(ctx, W, H, 0.35);
    return encode(c);
}

// ─── 11. MATRIX / HACKER ────────────────────────────────────────────────────
function matrix([name]) {
    const { c, ctx } = canvas();
    ctx.fillStyle = '#010a03'; ctx.fillRect(0, 0, W, H);
    const r = rng(77);
    const chars = '01ABCDEF<>{}[]/\\|=+*#$%';
    ctx.font = font.mono(22); ctx.textAlign = 'left';
    for (let x = 0; x < W; x += 24) {
        const len = 8 + Math.floor(r() * 24); const top = Math.floor(r() * (H / 24));
        for (let i = 0; i < len; i++) {
            const a = (i + 1) / len;
            ctx.fillStyle = i === len - 1 ? 'rgba(210,255,220,0.95)' : `rgba(0,255,90,${0.08 + a * 0.5})`;
            ctx.fillText(chars[Math.floor(r() * chars.length)], x, (top + i) * 24);
        }
    }
    const veil = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.5);
    veil.addColorStop(0, 'rgba(0,10,3,0.92)'); veil.addColorStop(1, 'rgba(0,10,3,0.2)');
    ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H);

    // terminal frame
    ctx.strokeStyle = '#00ff5a'; ctx.lineWidth = 3; ctx.shadowColor = '#00ff5a'; ctx.shadowBlur = 20;
    roundRectPath(ctx, 120, 190, W - 240, 340, 18); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,255,90,0.12)'; ctx.fillRect(121, 191, W - 242, 44);
    for (const [i, col] of ['#ff5f56', '#ffbd2e', '#27c93f'].entries()) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(158 + i * 34, 213, 10, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = font.mono(22); ctx.fillStyle = '#00ff5a'; ctx.textAlign = 'left'; ctx.fillText('root@codex:~$', 270, 220);

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const size = fit(ctx, up(name), font.monoBold, W - 340, 160, 36);
    ctx.font = font.monoBold(size);
    const y = 400;
    ctx.shadowColor = '#00ff5a'; ctx.shadowBlur = 40; ctx.fillStyle = '#00ff5a'; ctx.fillText(up(name), W / 2, y);
    ctx.shadowBlur = 10; ctx.fillStyle = '#d6ffe2'; ctx.fillText(up(name), W / 2, y);
    ctx.shadowBlur = 0; ctx.fillStyle = '#00ff5a';
    ctx.fillRect(W / 2 + ctx.measureText(up(name)).width / 2 + 14, y - size * 0.72, 22, size * 0.8);
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; for (let yy = 0; yy < H; yy += 4) ctx.fillRect(0, yy, W, 2);
    vignette(ctx, W, H, 0.5);
    return encode(c);
}

// ─── 12. GALAXY ─────────────────────────────────────────────────────────────
function galaxy([name]) {
    const { c, ctx } = canvas();
    radialBg(ctx, [[0, '#101a4a'], [0.6, '#060a20'], [1, '#01020a']]);
    const blob = (x, y, rad, col) => { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    ctx.globalCompositeOperation = 'screen';
    blob(260, 200, 420, 'rgba(140,60,255,0.45)'); blob(1020, 520, 460, 'rgba(0,150,255,0.4)'); blob(700, 380, 380, 'rgba(255,60,170,0.28)');
    ctx.globalCompositeOperation = 'source-over';

    const r = rng(101);
    for (let i = 0; i < 260; i++) {
        const x = r() * W; const y = r() * H; const rad = r() * 1.9 + 0.3;
        ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 9; i++) sparkle(ctx, 80 + r() * (W - 160), 70 + r() * (H - 140), 8 + r() * 12, '#cfe2ff');

    // orbit ring
    ctx.save(); ctx.translate(W / 2, H / 2 + 10); ctx.rotate(-0.18);
    ctx.strokeStyle = 'rgba(180,200,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.44, 130, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,220,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.4, 112, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const size = fit(ctx, up(name), font.bold, W * 0.76, 190);
    ctx.font = font.bold(size);
    const y = 400;
    ctx.shadowColor = '#7aa7ff'; ctx.shadowBlur = 60; ctx.fillStyle = '#7aa7ff'; ctx.fillText(up(name), W / 2, y);
    ctx.shadowColor = '#ff7be8'; ctx.shadowBlur = 26; ctx.fillStyle = '#ffffff'; ctx.fillText(up(name), W / 2, y);
    ctx.shadowBlur = 0;
    const g = ctx.createLinearGradient(W * 0.15, 0, W * 0.85, 0);
    [[0, '#7df9ff'], [0.5, '#ffffff'], [1, '#ff7be8']].forEach(([o, col]) => g.addColorStop(o, col));
    ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.strokeText(up(name), W / 2, y);
    vignette(ctx, W, H, 0.45);
    return encode(c);
}

const STYLES = {
    1: { fn: neon, mode: 'two', label: 'Neon tube' },
    2: { fn: gold, mode: 'two', label: 'Gold luxury' },
    3: { fn: fire, mode: 'two', label: 'Fire esports' },
    4: { fn: glitch, mode: 'two', label: 'Cyber glitch' },
    5: { fn: esports, mode: 'three', label: 'Esports banner' },
    6: { fn: holo, mode: 'three', label: 'Holographic glass card' },
    7: { fn: chrome, mode: 'two', label: 'Chrome ice' },
    8: { fn: comic, mode: 'two', label: 'Comic pop' },
    9: { fn: extrude, mode: 'one', label: '3D extrude' },
    10: { fn: synthwave, mode: 'one', label: 'Synthwave sunset' },
    11: { fn: matrix, mode: 'one', label: 'Matrix terminal' },
    12: { fn: galaxy, mode: 'one', label: 'Galaxy' },
};

function renderGfx(n, parts) {
    const style = STYLES[n];
    if (!style) throw new Error(`Unknown gfx style ${n}`);
    return style.fn(parts);
}

module.exports = { STYLES, renderGfx, W, H };
           
