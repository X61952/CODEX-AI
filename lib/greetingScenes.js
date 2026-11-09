'use strict';

/**
 * Background scenes for the greeting cards (1280x720), four per time of day.
 * Each scene draws onto the canvas and returns { text, shadow } colours for the
 * greeting text. The order here must match lib/greetingDesigns.js.
 *
 *   morning    winter dawn cottage · sunrise hills · misty lake · golden meadow
 *   afternoon  sunny beach · sunny hills · sunflower field · balloon valley
 *   night      fairy night sky · moonlit mountains · campfire stars · lanterns
 */

const { sparkle, rng } = require('./imageKit');

const W = 1280;
const H = 720;
const TAU = Math.PI * 2;

// ─── Helpers ────────────────────────────────────────────────────────────────
function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
}

function sky(ctx, stops) {
    ctx.fillStyle = grad(ctx, 0, 0, 0, H, stops);
    ctx.fillRect(0, 0, W, H);
}

function glow(ctx, x, y, radius, inner, outer = 'rgba(255,255,255,0)') {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function screen(ctx, fn) {
    ctx.globalCompositeOperation = 'screen';
    fn();
    ctx.globalCompositeOperation = 'source-over';
}

function rays(ctx, x, y, count, length, width, color) {
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < count; i++) {
        ctx.rotate(TAU / count);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(length, -width); ctx.lineTo(length, width); ctx.fill();
    }
    ctx.restore();
}

function hills(ctx, baseY, amp, seed, fill) {
    const r = rng(seed);
    const waves = [[0.004 + r() * 0.003, r() * TAU, 1], [0.011 + r() * 0.004, r() * TAU, 0.45], [0.023, r() * TAU, 0.18]];
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
        let y = baseY;
        for (const [f, p, a] of waves) y += Math.sin(x * f + p) * amp * a;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
}

function mountains(ctx, baseY, height, seed, fill, cap = null) {
    const r = rng(seed);
    const peaks = [];
    ctx.beginPath(); ctx.moveTo(0, H);
    let x = -40;
    while (x < W + 80) {
        const peak = baseY - height * (0.45 + r() * 0.55);
        const w = 120 + r() * 170;
        ctx.lineTo(x, baseY); ctx.lineTo(x + w * 0.5, peak);
        peaks.push({ x: x + w * 0.5, y: peak, w });
        x += w;
    }
    ctx.lineTo(W, baseY); ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (cap) {
        for (const p of peaks) {
            const d = baseY - p.y; const cy = p.y + d * 0.38; const hw = p.w * 0.5 * 0.38;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + hw, cy); ctx.lineTo(p.x + hw * 0.45, cy - d * 0.07);
            ctx.lineTo(p.x, cy + d * 0.03); ctx.lineTo(p.x - hw * 0.5, cy - d * 0.06); ctx.lineTo(p.x - hw, cy);
            ctx.closePath(); ctx.fillStyle = cap; ctx.fill();
        }
    }
}

function cloud(ctx, x, y, s, color, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    for (const [dx, dy, r] of [[0, 0, 46], [52, -18, 58], [108, 0, 48], [58, 14, 54], [-34, 14, 32], [142, 12, 30]]) {
        ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU); ctx.fill();
    }
    ctx.restore();
}

function bird(ctx, x, y, s, color = 'rgba(40,20,60,0.75)') {
    ctx.strokeStyle = color; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 16 * s, y); ctx.quadraticCurveTo(x - 7 * s, y - 12 * s, x, y); ctx.quadraticCurveTo(x + 7 * s, y - 12 * s, x + 16 * s, y); ctx.stroke();
}

function stars(ctx, r, n, yMax, minA = 0.25) {
    for (let i = 0; i < n; i++) {
        ctx.fillStyle = `rgba(255,255,255,${minA + r() * (1 - minA)})`;
        ctx.beginPath(); ctx.arc(r() * W, r() * yMax, r() * 1.9 + 0.3, 0, TAU); ctx.fill();
    }
}

function snowfall(ctx, r, n) {
    for (let i = 0; i < n; i++) {
        const big = r() > 0.9;
        ctx.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.6})`;
        if (big) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; }
        ctx.beginPath(); ctx.arc(r() * W, r() * H, big ? 2.6 + r() * 2 : 0.9 + r() * 1.6, 0, TAU); ctx.fill();
        ctx.shadowBlur = 0;
    }
}

function pine(ctx, x, y, h, body, snow = null) {
    ctx.fillStyle = '#2f2118'; ctx.fillRect(x - h * 0.03, y - h * 0.12, h * 0.06, h * 0.12);
    const w = h * 0.44;
    for (let i = 0; i < 4; i++) {
        const ty = y - h * 0.1 - i * h * 0.22; const tw = w * (1 - i * 0.2); const th = h * 0.34;
        ctx.fillStyle = body;
        ctx.beginPath(); ctx.moveTo(x, ty - th); ctx.lineTo(x + tw / 2, ty); ctx.lineTo(x - tw / 2, ty); ctx.closePath(); ctx.fill();
        if (snow) {
            ctx.fillStyle = snow;
            ctx.beginPath();
            ctx.moveTo(x, ty - th); ctx.lineTo(x + tw * 0.27, ty - th * 0.45); ctx.lineTo(x + tw * 0.12, ty - th * 0.5);
            ctx.lineTo(x, ty - th * 0.4); ctx.lineTo(x - tw * 0.12, ty - th * 0.5); ctx.lineTo(x - tw * 0.27, ty - th * 0.45);
            ctx.closePath(); ctx.fill();
        }
    }
}

function flameShape(ctx, x, baseY, w, h, stops) {
    const g = ctx.createLinearGradient(0, baseY, 0, baseY - h);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, baseY);
    ctx.bezierCurveTo(x - w * 0.8, baseY - h * 0.35, x - w * 0.15, baseY - h * 0.55, x + w * 0.05, baseY - h);
    ctx.bezierCurveTo(x + w * 0.1, baseY - h * 0.55, x + w * 0.8, baseY - h * 0.4, x + w / 2, baseY);
    ctx.closePath(); ctx.fill();
}

function planet(ctx, x, y, rad, [c1, c2, c3], { ring = false, tilt = -0.35, bands = 0 } = {}) {
    const drawRing = (front) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
        ctx.lineWidth = rad * 0.22;
        ctx.strokeStyle = grad(ctx, -rad * 2, 0, rad * 2, 0, [[0, 'rgba(230,200,150,0.25)'], [0.5, 'rgba(255,236,190,0.85)'], [1, 'rgba(230,200,150,0.25)']]);
        ctx.beginPath(); ctx.ellipse(0, 0, rad * 1.9, rad * 0.5, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke();
        ctx.restore();
    };
    if (ring) drawRing(false);
    const g = ctx.createRadialGradient(x - rad * 0.4, y - rad * 0.4, rad * 0.1, x, y, rad);
    g.addColorStop(0, c1); g.addColorStop(0.6, c2); g.addColorStop(1, c3);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    if (bands) {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.clip();
        for (let i = 0; i < bands; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'; ctx.fillRect(x - rad, y - rad + (i + 0.5) * (rad * 2 / bands), rad * 2, rad * 2 / bands * 0.7); }
        ctx.restore();
    }
    const shade = ctx.createRadialGradient(x - rad * 0.5, y - rad * 0.5, rad * 0.6, x, y, rad * 1.05);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,20,0.55)');
    ctx.fillStyle = shade; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    if (ring) drawRing(true);
}

function shootingStar(ctx, x, y, len, angle, width = 3) {
    const tx = x - Math.cos(angle) * len; const ty = y - Math.sin(angle) * len;
    ctx.strokeStyle = grad(ctx, tx, ty, x, y, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.95)']]);
    ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
    ctx.save(); ctx.shadowColor = '#cfe8ff'; ctx.shadowBlur = 16; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, width * 1.3, 0, TAU); ctx.fill(); ctx.restore();
}

// ─── MORNING 1 · Winter dawn cottage ────────────────────────────────────────
function cottage(ctx, x, y, s) {
    const w = 190 * s; const h = 108 * s; const roofH = 92 * s;

    ctx.fillStyle = 'rgba(40,60,120,0.35)'; ctx.beginPath(); ctx.ellipse(x + 20 * s, y + 8 * s, w * 0.72, 16 * s, 0, 0, TAU); ctx.fill();

    // chimney + smoke
    ctx.fillStyle = '#6e4a3c'; ctx.fillRect(x + w * 0.22, y - h - roofH * 0.95, 26 * s, 62 * s);
    ctx.fillStyle = '#f4f8ff'; ctx.fillRect(x + w * 0.22 - 3 * s, y - h - roofH * 0.95 - 8 * s, 32 * s, 12 * s);
    for (let i = 0; i < 6; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.5 - i * 0.07})`;
        ctx.beginPath(); ctx.arc(x + w * 0.22 + 13 * s + Math.sin(i * 1.3) * 12 * s + i * 7 * s, y - h - roofH * 0.95 - 24 * s - i * 26 * s, (11 + i * 5) * s, 0, TAU); ctx.fill();
    }

    // walls
    ctx.fillStyle = grad(ctx, 0, y - h, 0, y, [[0, '#9a6743'], [1, '#6b4228']]);
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.strokeStyle = 'rgba(40,20,10,0.35)'; ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - w / 2, y - h + (h / 6) * i); ctx.lineTo(x + w / 2, y - h + (h / 6) * i); ctx.stroke(); }

    // roof with a thick snow blanket
    ctx.fillStyle = '#5a2e2a';
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 18 * s, y - h + 4 * s); ctx.lineTo(x, y - h - roofH); ctx.lineTo(x + w / 2 + 18 * s, y - h + 4 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f7faff';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 22 * s, y - h + 8 * s); ctx.lineTo(x, y - h - roofH - 5 * s); ctx.lineTo(x + w / 2 + 22 * s, y - h + 8 * s);
    for (let i = 0; i <= 8; i++) { const px = x + w / 2 + 22 * s - ((w + 44 * s) / 8) * i; ctx.quadraticCurveTo(px + 9 * s, y - h + 8 * s + (i % 2 ? 22 : 12) * s, px, y - h + 8 * s); }
    ctx.closePath(); ctx.fill();

    // windows with warm light
    for (const wx of [x - w * 0.27, x + w * 0.2]) {
        screen(ctx, () => glow(ctx, wx, y - h * 0.5, 90 * s, 'rgba(255,200,100,0.55)', 'rgba(255,160,60,0)'));
        ctx.fillStyle = grad(ctx, 0, y - h * 0.75, 0, y - h * 0.25, [[0, '#fff1a8'], [1, '#ffb84a']]);
        ctx.fillRect(wx - 17 * s, y - h * 0.72, 34 * s, 36 * s);
        ctx.strokeStyle = '#4b2c1b'; ctx.lineWidth = 4 * s; ctx.strokeRect(wx - 17 * s, y - h * 0.72, 34 * s, 36 * s);
        ctx.beginPath(); ctx.moveTo(wx, y - h * 0.72); ctx.lineTo(wx, y - h * 0.72 + 36 * s); ctx.moveTo(wx - 17 * s, y - h * 0.72 + 18 * s); ctx.lineTo(wx + 17 * s, y - h * 0.72 + 18 * s); ctx.stroke();
        ctx.fillStyle = '#f7faff'; ctx.fillRect(wx - 20 * s, y - h * 0.72 + 34 * s, 40 * s, 6 * s);
    }
    // door + wreath
    ctx.fillStyle = '#4a2a1a'; ctx.beginPath(); ctx.moveTo(x - 5 * s, y); ctx.lineTo(x - 5 * s, y - 52 * s); ctx.arc(x + 11 * s, y - 52 * s, 16 * s, Math.PI, 0); ctx.lineTo(x + 27 * s, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2f8f4e'; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.arc(x + 11 * s, y - 36 * s, 8 * s, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(x + 11 * s, y - 28 * s, 3 * s, 0, TAU); ctx.fill();
    // light spilling on the snow
    screen(ctx, () => glow(ctx, x + 10 * s, y + 10 * s, 130 * s, 'rgba(255,190,90,0.35)', 'rgba(255,160,60,0)'));
    // fence
    ctx.fillStyle = '#5d3b27';
    for (let i = 0; i < 5; i++) { const fx = x + w / 2 + 22 * s + i * 16 * s; ctx.fillRect(fx, y - 26 * s, 6 * s, 26 * s); ctx.fillStyle = '#f7faff'; ctx.fillRect(fx - 1 * s, y - 29 * s, 8 * s, 5 * s); ctx.fillStyle = '#5d3b27'; }
}

function winterDawn(ctx) {
    const r = rng(101);
    sky(ctx, [[0, '#0f1a48'], [0.3, '#33448c'], [0.55, '#b36db0'], [0.74, '#ffa88e'], [1, '#ffdab2']]);

    screen(ctx, () => {
        for (const [y0, col, amp, ph] of [[60, '#58ffbe', 36, 0], [150, '#8aa0ff', 30, 1.7], [30, '#ff78dc', 26, 3.1]]) {
            ctx.beginPath(); ctx.moveTo(0, y0);
            for (let x = 0; x <= W; x += 10) ctx.lineTo(x, y0 + Math.sin(x * 0.006 + ph) * amp + Math.sin(x * 0.017 + ph * 2) * amp * 0.35);
            for (let x = W; x >= 0; x -= 10) ctx.lineTo(x, y0 + 130 + Math.sin(x * 0.005 + ph + 1) * amp * 0.8);
            ctx.closePath();
            const g = ctx.createLinearGradient(0, y0 - 40, 0, y0 + 170);
            g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, col + '55'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.fill();
        }
        glow(ctx, 940, 500, 560, 'rgba(255,170,130,0.7)', 'rgba(255,110,90,0)');
    });

    stars(ctx, r, 170, 330);
    const pastel = ['#ffffff', '#cfe8ff', '#ffd6f3', '#d6fff1', '#fff2c4'];
    for (let i = 0; i < 24; i++) sparkle(ctx, 40 + r() * (W - 80), 30 + r() * 360, 5 + r() * 9, pastel[i % pastel.length]);

    mountains(ctx, 520, 190, 5, '#8c97d6', '#eef2ff');
    mountains(ctx, 560, 150, 8, '#6d78bd', '#dfe6ff');
    hills(ctx, 585, 34, 3, '#b7c7f0'); hills(ctx, 625, 30, 6, '#d6e2fa'); hills(ctx, 668, 24, 12, '#f1f6ff');
    ctx.fillStyle = 'rgba(255,150,130,0.12)'; ctx.fillRect(0, 560, W, 160);

    for (const [x, y, h] of [[1040, 610, 150], [1100, 626, 190], [1170, 618, 160], [1225, 636, 120], [640, 600, 80], [700, 606, 60]]) pine(ctx, x, y, h, '#1c4a46', '#f4f8ff');
    ctx.fillStyle = '#f1f6ff'; ctx.beginPath(); ctx.ellipse(310, 603, 190, 32, 0, 0, TAU); ctx.fill();
    cottage(ctx, 300, 598, 1);
    pine(ctx, 150, 610, 120, '#1c4a46', '#f4f8ff'); pine(ctx, 90, 622, 90, '#1c4a46', '#f4f8ff');

    snowfall(ctx, r, 140);
    for (let i = 0; i < 26; i++) sparkle(ctx, r() * W, 640 + r() * 70, 3 + r() * 5, '#ffffff');
    return { text: '#ffffff', shadow: 'rgba(14,24,90,0.7)' };
}

// ─── MORNING 2 · Sunrise over the hills ─────────────────────────────────────
function sunriseHills(ctx) {
    sky(ctx, [[0, '#231a5c'], [0.3, '#7b3a93'], [0.55, '#e0586a'], [0.78, '#ff9a5c'], [1, '#ffd37a']]);
    const sx = W / 2; const sy = 525;
    screen(ctx, () => { glow(ctx, sx, sy, 560, 'rgba(255,200,110,0.65)', 'rgba(255,120,60,0)'); rays(ctx, sx, sy, 18, 900, 26, 'rgba(255,230,160,0.07)'); });
    const sun = ctx.createRadialGradient(sx, sy, 10, sx, sy, 125);
    sun.addColorStop(0, '#fffbe8'); sun.addColorStop(0.65, '#ffe08a'); sun.addColorStop(1, '#ffb347');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 125, 0, TAU); ctx.fill();
    cloud(ctx, 40, 440, 1.2, '#ffb7b0', 0.4); cloud(ctx, 880, 430, 1.4, '#ffc9a0', 0.38); cloud(ctx, 20, 60, 0.7, '#ffb0c8', 0.3);
    for (const [x, y, s] of [[1020, 400, 1.2], [1080, 372, 0.9], [955, 430, 0.8]]) bird(ctx, x, y, s);
    hills(ctx, 560, 46, 3, '#8a3e7e'); hills(ctx, 610, 42, 7, '#5c2a66'); hills(ctx, 660, 36, 11, '#33164a');
    return { text: '#ffffff', shadow: 'rgba(70,20,70,0.6)' };
}

// ─── MORNING 3 · Misty lake sunrise ─────────────────────────────────────────
function mistyLake(ctx) {
    const r = rng(33);
    sky(ctx, [[0, '#35398a'], [0.3, '#a07acb'], [0.5, '#ffbd9c'], [0.6, '#fff0cf'], [1, '#fff0cf']]);
    const sx = 650; const sy = 440;
    screen(ctx, () => { glow(ctx, sx, sy, 520, 'rgba(255,225,170,0.75)', 'rgba(255,160,120,0)'); rays(ctx, sx, sy, 16, 800, 22, 'rgba(255,240,200,0.07)'); });
    const sun = ctx.createRadialGradient(sx, sy, 8, sx, sy, 92);
    sun.addColorStop(0, '#fffdf2'); sun.addColorStop(1, '#ffd98a');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 92, 0, TAU); ctx.fill();

    mountains(ctx, 470, 220, 15, '#a78bc9'); mountains(ctx, 480, 160, 22, '#7c6bb3'); mountains(ctx, 490, 110, 28, '#51508f');

    // lake
    const lake = ctx.createLinearGradient(0, 490, 0, H);
    lake.addColorStop(0, '#ffcfa5'); lake.addColorStop(0.35, '#a98ac4'); lake.addColorStop(1, '#2d3573');
    ctx.fillStyle = lake; ctx.fillRect(0, 490, W, H - 490);
    for (let i = 0; i < 46; i++) {
        const y = 496 + i * 4.9; const spread = 40 + i * 5;
        ctx.fillStyle = `rgba(255,236,190,${Math.max(0, 0.5 - i * 0.011)})`;
        ctx.fillRect(sx - spread / 2 + (r() - 0.5) * spread * 0.4, y, spread * (0.4 + r() * 0.6), 2.4);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) { const y = 505 + r() * 200; const x = r() * W; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + r() * 90, y); ctx.stroke(); }

    // mist
    for (const [y, a] of [[420, 0.28], [470, 0.34], [520, 0.2]]) {
        const g = ctx.createLinearGradient(0, y - 40, 0, y + 40);
        g.addColorStop(0, 'rgba(255,245,235,0)'); g.addColorStop(0.5, `rgba(255,245,235,${a})`); g.addColorStop(1, 'rgba(255,245,235,0)');
        ctx.fillStyle = g; ctx.fillRect(0, y - 40, W, 80);
    }

    // shore pines + rowboat
    for (const [x, y, h] of [[60, 600, 220], [130, 620, 170], [210, 612, 130], [1160, 600, 230], [1230, 622, 170], [1090, 616, 120]]) pine(ctx, x, y, h, '#1e2150');
    ctx.fillStyle = '#1e2150'; ctx.beginPath(); ctx.moveTo(830, 586); ctx.quadraticCurveTo(870, 606, 930, 586); ctx.lineTo(922, 580); ctx.lineTo(838, 580); ctx.closePath(); ctx.fill();
    ctx.fillRect(878, 556, 4, 28);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(880, 598, 70, 7, 0, 0, TAU); ctx.stroke();
    for (const [x, y, s] of [[980, 360, 1.3], [1030, 335, 1], [920, 385, 0.9], [1075, 380, 0.8]]) bird(ctx, x, y, s, 'rgba(50,30,90,0.7)');
    for (let i = 0; i < 14; i++) sparkle(ctx, 60 + r() * (W - 120), 40 + r() * 280, 4 + r() * 6, '#fff4dc');
    return { text: '#ffffff', shadow: 'rgba(60,30,100,0.65)' };
}

// ─── MORNING 4 · Golden meadow ──────────────────────────────────────────────
function butterfly(ctx, x, y, s, c1, c2, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    for (const m of [-1, 1]) {
        ctx.fillStyle = c1; ctx.beginPath(); ctx.ellipse(m * 10 * s, -7 * s, 11 * s, 15 * s, m * 0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.ellipse(m * 8 * s, 9 * s, 8 * s, 10 * s, -m * 0.4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#2b1c38'; ctx.fillRect(-1.6 * s, -12 * s, 3.2 * s, 26 * s);
    ctx.strokeStyle = '#2b1c38'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(0, -12 * s); ctx.lineTo(-5 * s, -22 * s); ctx.moveTo(0, -12 * s); ctx.lineTo(5 * s, -22 * s); ctx.stroke();
    ctx.restore();
}

function goldenMeadow(ctx) {
    const r = rng(61);
    sky(ctx, [[0, '#5d9bec'], [0.45, '#b9d9f5'], [0.7, '#ffe3ac'], [1, '#fff2c8']]);
    const sx = 320; const sy = 470;
    screen(ctx, () => { glow(ctx, sx, sy, 600, 'rgba(255,225,150,0.8)', 'rgba(255,200,120,0)'); rays(ctx, sx, sy, 20, 1000, 24, 'rgba(255,240,190,0.07)'); });
    const sun = ctx.createRadialGradient(sx, sy, 8, sx, sy, 105);
    sun.addColorStop(0, '#fffef0'); sun.addColorStop(0.7, '#ffe58f'); sun.addColorStop(1, '#ffc94d');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 105, 0, TAU); ctx.fill();
    cloud(ctx, 900, 430, 1.3, '#ffffff', 0.7); cloud(ctx, 1110, 70, 0.7, '#ffffff', 0.55); cloud(ctx, 20, 70, 0.7, '#ffffff', 0.5);

    hills(ctx, 520, 40, 4, '#7bbf9a'); hills(ctx, 575, 38, 9, '#9dc96a'); hills(ctx, 630, 34, 14, '#c3c85a');
    // lone tree
    ctx.fillStyle = '#6b4a2d'; ctx.fillRect(1000, 520, 12, 70);
    for (const [dx, dy, rr] of [[0, -30, 50], [-34, -8, 38], [34, -6, 40], [8, -62, 36]]) { ctx.fillStyle = '#4f9a55'; ctx.beginPath(); ctx.arc(1006 + dx, 510 + dy, rr, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.arc(992, 458, 22, 0, TAU); ctx.fill();

    // grass + wildflowers
    ctx.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
        const x = r() * W; const y = 560 + r() * 170; const hgt = 14 + (y - 560) * 0.25 + r() * 18;
        ctx.strokeStyle = ['#6aa84f', '#86bb54', '#a9c957', '#58994a'][i % 4]; ctx.lineWidth = 1.6 + (y - 560) * 0.01;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + (r() - 0.5) * 12, y - hgt * 0.55, x + (r() - 0.5) * 18, y - hgt); ctx.stroke();
    }
    const petals = ['#ffffff', '#ff9ec7', '#c9a3ff', '#ffd84d', '#ff7b7b'];
    for (let i = 0; i < 46; i++) {
        const x = r() * W; const y = 600 + r() * 110; const s = 0.7 + (y - 600) / 110;
        ctx.strokeStyle = '#4f8f43'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + 20 * s); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = petals[i % petals.length];
        for (let k = 0; k < 5; k++) { const a = (TAU / 5) * k; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 5 * s, y + Math.sin(a) * 5 * s, 4.2 * s, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.arc(x, y, 3 * s, 0, TAU); ctx.fill();
    }
    butterfly(ctx, 640, 520, 1.1, '#ff9ec7', '#ffd1e6', -0.4); butterfly(ctx, 760, 470, 0.9, '#7ad7ff', '#c6f0ff', 0.5); butterfly(ctx, 520, 565, 0.8, '#ffd84d', '#fff0a6', 0.2);
    for (let i = 0; i < 34; i++) sparkle(ctx, r() * W, 540 + r() * 170, 2.5 + r() * 4, '#ffffff');
    return { text: '#ffffff', shadow: 'rgba(20,70,120,0.55)' };
}

// ─── AFTERNOON 1 · Sunny beach ──────────────────────────────────────────────
function palm(ctx, x, baseY, h, lean) {
    const topX = x + lean * h * 0.28; const topY = baseY - h;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 20;
    ctx.beginPath(); ctx.moveTo(x, baseY); ctx.quadraticCurveTo(x + lean * h * 0.02, baseY - h * 0.55, topX, topY); ctx.stroke();
    ctx.strokeStyle = '#98693d'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(x - 4, baseY); ctx.quadraticCurveTo(x + lean * h * 0.02 - 4, baseY - h * 0.55, topX - 3, topY); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,35,15,0.4)'; ctx.lineWidth = 2;
    for (let i = 1; i < 12; i++) { const t = i / 12; const px = (1 - t) * (1 - t) * x + 2 * (1 - t) * t * (x + lean * h * 0.02) + t * t * topX; const py = (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * (baseY - h * 0.55) + t * t * topY; ctx.beginPath(); ctx.moveTo(px - 10, py); ctx.lineTo(px + 10, py + 2); ctx.stroke(); }
    for (let i = 0; i < 9; i++) {
        const ang = -Math.PI * 0.98 + i * (Math.PI * 0.96 / 8); const len = h * (0.46 + (i % 2) * 0.08);
        const ex = topX + Math.cos(ang) * len; const ey = topY + Math.sin(ang) * len + len * 0.36;
        const cx1 = topX + Math.cos(ang) * len * 0.55; const cy1 = topY + Math.sin(ang) * len * 0.55 - len * 0.18;
        ctx.fillStyle = i % 2 ? '#2f9e57' : '#3fb868';
        ctx.beginPath(); ctx.moveTo(topX, topY); ctx.quadraticCurveTo(cx1, cy1 - 14, ex, ey); ctx.quadraticCurveTo(cx1, cy1 + 16, topX, topY); ctx.fill();
        ctx.strokeStyle = 'rgba(15,80,40,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(topX, topY); ctx.quadraticCurveTo(cx1, cy1, ex, ey); ctx.stroke();
    }
    ctx.fillStyle = '#5b3a1f'; for (const dx of [-9, 3, 12]) { ctx.beginPath(); ctx.arc(topX + dx, topY + 14, 8, 0, TAU); ctx.fill(); }
}

function umbrella(ctx, x, y, s) {
    ctx.strokeStyle = '#f2efe6'; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(x + 8 * s, y + 90 * s); ctx.lineTo(x - 6 * s, y); ctx.stroke();
    ctx.save(); ctx.translate(x - 6 * s, y); ctx.rotate(-0.16);
    const R = 100 * s; const segs = 8;
    for (let i = 0; i < segs; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ff4d5e';
        ctx.beginPath(); ctx.moveTo(0, -R * 0.55); ctx.arc(0, 0, R, Math.PI + (Math.PI / segs) * i, Math.PI + (Math.PI / segs) * (i + 1)); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(120,20,30,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R, Math.PI, TAU); ctx.stroke();
    ctx.restore();
}

function sunnyBeach(ctx) {
    const r = rng(15);
    sky(ctx, [[0, '#0f8cf0'], [0.35, '#5fc4ff'], [0.52, '#d9f6ff'], [1, '#d9f6ff']]);
    const sx = 1190; const sy = 330;
    screen(ctx, () => { glow(ctx, sx, sy, 520, 'rgba(255,248,200,0.85)', 'rgba(255,255,255,0)'); rays(ctx, sx, sy, 22, 1200, 26, 'rgba(255,255,255,0.08)'); });
    const sun = ctx.createRadialGradient(sx, sy, 6, sx, sy, 62);
    sun.addColorStop(0, '#ffffff'); sun.addColorStop(0.55, '#fff4a8'); sun.addColorStop(1, '#ffd23f');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 62, 0, TAU); ctx.fill();
    cloud(ctx, 20, 60, 0.8, '#ffffff', 0.75); cloud(ctx, 1110, 70, 0.7, '#ffffff', 0.6); cloud(ctx, 40, 345, 0.9, '#ffffff', 0.8); cloud(ctx, 800, 352, 0.6, '#ffffff', 0.75);

    // sea
    const sea = ctx.createLinearGradient(0, 380, 0, 540);
    sea.addColorStop(0, '#1fd0e0'); sea.addColorStop(0.5, '#10a8d0'); sea.addColorStop(1, '#2ac7c9');
    ctx.fillStyle = sea; ctx.fillRect(0, 380, W, 170);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 380, W, 3);
    for (let i = 0; i < 70; i++) {
        const y = 390 + r() * 140; const x = r() * W; ctx.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.22})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 18, y - 4, x + 40 + r() * 30, y); ctx.stroke();
    }
    for (let i = 0; i < 40; i++) { const gx = sx - 260 + r() * 520; const gy = 392 + r() * 130; ctx.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.5})`; ctx.fillRect(gx, gy, 6 + r() * 16, 2); }
    // sailboat
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(700, 372); ctx.lineTo(700, 424); ctx.lineTo(738, 424); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffe3e6'; ctx.beginPath(); ctx.moveTo(694, 380); ctx.lineTo(694, 424); ctx.lineTo(668, 424); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b4a30'; ctx.beginPath(); ctx.moveTo(660, 428); ctx.lineTo(746, 428); ctx.lineTo(732, 440); ctx.lineTo(674, 440); ctx.closePath(); ctx.fill();

    // sand + shoreline foam
    const shore = (x) => 528 + Math.sin(x * 0.006) * 14 + Math.sin(x * 0.017 + 1) * 5;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, shore(x));
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, 520, 0, H, [[0, '#b99a5e'], [0.12, '#f1d89b'], [1, '#e8c785']]); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath();
    for (let x = 0; x <= W; x += 8) { const y = shore(x) - 3; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath();
    for (let x = 0; x <= W; x += 8) { const y = shore(x) - 16 + Math.sin(x * 0.03) * 2; if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
    for (let i = 0; i < 380; i++) { ctx.fillStyle = `rgba(150,110,50,${0.1 + r() * 0.18})`; ctx.fillRect(r() * W, 560 + r() * 160, 2, 2); }

    palm(ctx, 120, 660, 300, 1); palm(ctx, 1170, 670, 290, -1);
    umbrella(ctx, 350, 505, 1);
    ctx.fillStyle = '#ff9f1c'; ctx.save(); ctx.translate(255, 583); ctx.rotate(-0.06); ctx.fillRect(0, 0, 150, 28); ctx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) ctx.fillRect(10 + i * 36, 0, 14, 28); ctx.restore();
    ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(900, 585, 20, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(900, 585, 20, 0.3, 1.2); ctx.lineTo(900, 585); ctx.fill(); ctx.fillStyle = '#3a86ff'; ctx.beginPath(); ctx.arc(900, 585, 20, 2.6, 3.7); ctx.lineTo(900, 585); ctx.fill();
    ctx.fillStyle = '#ff7b9c'; ctx.beginPath(); ctx.arc(1010, 600, 10, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd6a5'; ctx.beginPath(); ctx.arc(1040, 592, 7, 0, TAU); ctx.fill();
    for (const [x, y, s] of [[560, 300, 1.2], [610, 276, 0.9], [940, 250, 1.0], [320, 270, 0.9]]) bird(ctx, x, y, s, 'rgba(30,60,100,0.6)');
    for (let i = 0; i < 16; i++) sparkle(ctx, r() * W, 395 + r() * 130, 3 + r() * 5, '#ffffff');
    return { text: '#ffffff', shadow: 'rgba(0,70,130,0.55)' };
}

// ─── AFTERNOON 2 · Sunny hills ──────────────────────────────────────────────
function sunnyHills(ctx) {
    sky(ctx, [[0, '#1668f0'], [0.55, '#59b7ff'], [1, '#d6f0ff']]);
    const sx = 1130; const sy = 430;
    screen(ctx, () => { glow(ctx, sx, sy, 520, 'rgba(255,245,200,0.75)', 'rgba(255,255,255,0)'); rays(ctx, sx, sy, 20, 1100, 24, 'rgba(255,255,255,0.07)'); });
    const sun = ctx.createRadialGradient(sx, sy, 6, sx, sy, 80);
    sun.addColorStop(0, '#ffffff'); sun.addColorStop(0.55, '#fff3a6'); sun.addColorStop(1, '#ffd23f');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 80, 0, TAU); ctx.fill();
    cloud(ctx, 20, 60, 0.8, '#ffffff', 0.7); cloud(ctx, 1110, 70, 0.7, '#ffffff', 0.6);
    cloud(ctx, 60, 410, 1.3, '#ffffff', 0.9); cloud(ctx, 420, 455, 1.0, '#ffffff', 0.85); cloud(ctx, 730, 405, 1.2, '#ffffff', 0.85);
    bird(ctx, 600, 400, 1.1, 'rgba(20,50,100,0.6)'); bird(ctx, 650, 378, 0.85, 'rgba(20,50,100,0.6)'); bird(ctx, 930, 360, 1, 'rgba(20,50,100,0.6)');
    hills(ctx, 540, 40, 5, '#58c277'); hills(ctx, 595, 38, 9, '#34a35a'); hills(ctx, 650, 34, 13, '#1f7d41');
    // windmill
    ctx.fillStyle = '#f4efe2'; ctx.beginPath(); ctx.moveTo(250, 590); ctx.lineTo(300, 590); ctx.lineTo(286, 480); ctx.lineTo(264, 480); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9482f'; ctx.beginPath(); ctx.moveTo(258, 484); ctx.lineTo(275, 456); ctx.lineTo(292, 484); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(275, 474); ctx.rotate(0.35);
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#8b6b4a'; ctx.lineWidth = 3; ctx.fillRect(4, -9, 78, 18); ctx.strokeRect(4, -9, 78, 18); }
    ctx.restore(); ctx.fillStyle = '#8b6b4a'; ctx.beginPath(); ctx.arc(275, 474, 7, 0, TAU); ctx.fill();
    return { text: '#ffffff', shadow: 'rgba(8,50,120,0.55)' };
}

// ─── AFTERNOON 3 · Sunflower field ──────────────────────────────────────────
function sunflower(ctx, x, y, s, r) {
    ctx.strokeStyle = '#3f8f3f'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y + 150 * s); ctx.quadraticCurveTo(x + (r() - 0.5) * 20 * s, y + 70 * s, x, y); ctx.stroke();
    ctx.fillStyle = '#4aa34a';
    ctx.beginPath(); ctx.ellipse(x - 20 * s, y + 80 * s, 22 * s, 9 * s, -0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 20 * s, y + 102 * s, 22 * s, 9 * s, 0.5, 0, TAU); ctx.fill();
    const petals = 18; const pr = 34 * s;
    for (let layer = 0; layer < 2; layer++) {
        for (let i = 0; i < petals; i++) {
            const a = (TAU / petals) * i + layer * (Math.PI / petals);
            ctx.save(); ctx.translate(x, y); ctx.rotate(a);
            ctx.fillStyle = layer ? '#ffcf1f' : '#f5b800';
            ctx.beginPath(); ctx.ellipse(pr * 0.95, 0, pr * 0.62, pr * 0.2, 0, 0, TAU); ctx.fill();
            ctx.restore();
        }
    }
    const c = ctx.createRadialGradient(x - 4 * s, y - 4 * s, 2, x, y, 24 * s);
    c.addColorStop(0, '#8a5a2b'); c.addColorStop(1, '#3d2410');
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 22 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,150,0.35)';
    for (let i = 0; i < 14; i++) { const a = i * 2.4; ctx.beginPath(); ctx.arc(x + Math.cos(a) * i * 1.3 * s, y + Math.sin(a) * i * 1.3 * s, 1.4 * s, 0, TAU); ctx.fill(); }
}

function sunflowerField(ctx) {
    const r = rng(27);
    sky(ctx, [[0, '#1a7be6'], [0.5, '#6ec6ff'], [0.75, '#e6f7ff'], [1, '#e6f7ff']]);
    const sx = 1170; const sy = 340;
    screen(ctx, () => { glow(ctx, sx, sy, 560, 'rgba(255,245,190,0.85)', 'rgba(255,255,255,0)'); rays(ctx, sx, sy, 22, 1300, 26, 'rgba(255,255,255,0.08)'); });
    const sun = ctx.createRadialGradient(sx, sy, 6, sx, sy, 62);
    sun.addColorStop(0, '#ffffff'); sun.addColorStop(0.6, '#fff1a0'); sun.addColorStop(1, '#ffd23f');
    ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(sx, sy, 62, 0, TAU); ctx.fill();
    cloud(ctx, 20, 70, 0.8, '#ffffff', 0.7); cloud(ctx, 640, 445, 0.8, '#ffffff', 0.8); cloud(ctx, 100, 400, 1.1, '#ffffff', 0.8);
    hills(ctx, 470, 28, 31, '#6fae8f'); hills(ctx, 510, 30, 37, '#79b64e');
    const fieldTop = 470;
    ctx.fillStyle = grad(ctx, 0, fieldTop, 0, H, [[0, '#6aa83c'], [1, '#3f7f2a']]); ctx.fillRect(0, fieldTop + 30, W, H);
    // rows from back to front
    const rows = [[500, 0.42, 14], [535, 0.55, 12], [575, 0.72, 10], [625, 0.95, 8], [685, 1.25, 6]];
    for (const [y, s, count] of rows) {
        for (let i = 0; i < count; i++) { const x = (i + 0.3 + r() * 0.4) * (W / count); sunflower(ctx, x, y, s, r); }
    }
    butterfly(ctx, 620, 540, 1.0, '#ffffff', '#ffe3a0', -0.3);
    for (let i = 0; i < 18; i++) sparkle(ctx, r() * W, 480 + r() * 230, 3 + r() * 5, '#fff6c8');
    return { text: '#ffffff', shadow: 'rgba(10,60,130,0.55)' };
}

// ─── AFTERNOON 4 · Balloon valley ───────────────────────────────────────────
function balloon(ctx, x, y, s, colors) {
    const rw = 46 * s; const rh = 58 * s;
    const path = () => {
        ctx.beginPath(); ctx.moveTo(x, y - rh);
        ctx.bezierCurveTo(x + rw * 1.3, y - rh, x + rw * 1.2, y + rh * 0.35, x + rw * 0.28, y + rh * 0.95);
        ctx.lineTo(x - rw * 0.28, y + rh * 0.95);
        ctx.bezierCurveTo(x - rw * 1.2, y + rh * 0.35, x - rw * 1.3, y - rh, x, y - rh); ctx.closePath();
    };
    ctx.save(); path(); ctx.clip();
    const n = colors.length * 2;
    for (let i = 0; i < n; i++) { ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(x - rw * 1.3 + (i * rw * 2.6) / n, y - rh, (rw * 2.6) / n + 1, rh * 2); }
    const sh = ctx.createLinearGradient(x - rw, 0, x + rw, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0.35)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,40,0.35)');
    ctx.fillStyle = sh; ctx.fillRect(x - rw * 1.3, y - rh, rw * 2.6, rh * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(60,30,30,0.55)'; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.moveTo(x - rw * 0.28, y + rh * 0.95); ctx.lineTo(x - 9 * s, y + rh * 1.32); ctx.moveTo(x + rw * 0.28, y + rh * 0.95); ctx.lineTo(x + 9 * s, y + rh * 1.32); ctx.stroke();
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x - 11 * s, y + rh * 1.32, 22 * s, 14 * s);
}

function balloonValley(ctx) {
    const r = rng(45);
    sky(ctx, [[0, '#2d7cf0'], [0.45, '#7cc6ff'], [0.75, '#ffe9c2'], [1, '#ffe9c2']]);
    const sx = 140; const sy = 440;
    screen(ctx, () => { glow(ctx, sx, sy, 540, 'rgba(255,236,170,0.8)', 'rgba(255,200,120,0)'); rays(ctx, sx, sy, 18, 1000, 24, 'rgba(255,255,255,0.07)'); });
    cloud(ctx, 880, 410, 1.2, '#ffffff', 0.85); cloud(ctx, 330, 360, 0.9, '#ffffff', 0.75); cloud(ctx, 1110, 70, 0.7, '#ffffff', 0.6); cloud(ctx, 20, 70, 0.7, '#ffffff', 0.6);
    mountains(ctx, 560, 150, 52, '#8fb7d9'); hills(ctx, 590, 36, 8, '#78b86f'); hills(ctx, 640, 34, 19, '#4f9e55'); hills(ctx, 690, 28, 23, '#35813f');
    const palette = [['#ff4d5e', '#ffffff'], ['#3a86ff', '#ffd23f'], ['#8338ec', '#ff8fb8'], ['#06b6a4', '#fff0a8'], ['#ff9f1c', '#ffffff'], ['#e63946', '#ffd6a5']];
    const items = [[300, 430, 0.8, 0], [470, 470, 1.1, 1], [640, 410, 0.7, 2], [790, 480, 1.3, 3], [960, 420, 0.9, 4], [1110, 470, 1.15, 5], [90, 500, 0.6, 2], [1210, 400, 0.6, 1]];
    for (const [x, y, s, c] of items.sort((a, b) => a[2] - b[2])) balloon(ctx, x, y, s, palette[c]);
    for (const [x, y, s] of [[520, 560, 1.0], [980, 330, 0.9], [700, 340, 0.8]]) bird(ctx, x, y, s, 'rgba(30,60,100,0.55)');
    for (let i = 0; i < 14; i++) sparkle(ctx, r() * W, 380 + r() * 200, 3 + r() * 5, '#ffffff');
    return { text: '#ffffff', shadow: 'rgba(10,50,130,0.55)' };
}

// ─── NIGHT 1 · Fairy night sky ──────────────────────────────────────────────
function fairy(ctx, x, y, s, hue) {
    screen(ctx, () => glow(ctx, x, y, 95 * s, `hsla(${hue},100%,75%,0.5)`, `hsla(${hue},100%,70%,0)`));
    // wings
    for (const m of [-1, 1]) {
        for (const [dx, dy, w, h, rot] of [[7, -16, 17, 36, 0.55], [6, -7, 11, 22, 1.05]]) {
            ctx.save(); ctx.translate(x + dx * m * s, y + dy * s); ctx.rotate(rot * m);
            const g = ctx.createRadialGradient(0, -h * 0.4 * s, 2, 0, -h * 0.4 * s, h * s);
            g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, `hsla(${hue},100%,80%,0.28)`);
            ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.ellipse(0, -h * 0.5 * s, w * s, h * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h * 1.6 * s); ctx.moveTo(0, -h * 0.5 * s); ctx.lineTo(w * 0.7 * s, -h * 0.9 * s); ctx.moveTo(0, -h * 0.5 * s); ctx.lineTo(-w * 0.7 * s, -h * 0.9 * s); ctx.stroke();
            ctx.restore();
        }
    }
    // dress
    ctx.fillStyle = `hsl(${hue},88%,66%)`;
    ctx.beginPath(); ctx.moveTo(x - 5 * s, y - 4 * s); ctx.quadraticCurveTo(x - 24 * s, y + 26 * s, x - 16 * s, y + 38 * s); ctx.lineTo(x + 16 * s, y + 38 * s); ctx.quadraticCurveTo(x + 24 * s, y + 26 * s, x + 5 * s, y - 4 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `hsl(${hue},95%,82%)`;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * 10 * s, y + 38 * s, 6 * s, 0, Math.PI); ctx.fill(); }
    ctx.fillStyle = `hsl(${hue},90%,78%)`; ctx.fillRect(x - 5 * s, y - 15 * s, 10 * s, 14 * s);
    // legs
    ctx.strokeStyle = '#ffe2cf'; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 4 * s, y + 38 * s); ctx.lineTo(x - 6 * s, y + 52 * s); ctx.moveTo(x + 4 * s, y + 38 * s); ctx.lineTo(x + 2 * s, y + 52 * s); ctx.stroke();
    // head + hair
    ctx.fillStyle = '#ffe2cf'; ctx.beginPath(); ctx.arc(x, y - 23 * s, 8.5 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = `hsl(${(hue + 40) % 360},55%,32%)`; ctx.beginPath(); ctx.arc(x, y - 27.5 * s, 9.5 * s, Math.PI, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + 8 * s, y - 33 * s, 5 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a2a2a'; for (const dx of [-3, 3]) { ctx.beginPath(); ctx.arc(x + dx * s, y - 22 * s, 1.1 * s, 0, TAU); ctx.fill(); }
    // arm + wand
    ctx.strokeStyle = '#ffe2cf'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(x + 4 * s, y - 12 * s); ctx.lineTo(x + 22 * s, y - 28 * s); ctx.stroke();
    ctx.strokeStyle = '#f4d77a'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x + 20 * s, y - 26 * s); ctx.lineTo(x + 32 * s, y - 40 * s); ctx.stroke();
    sparkle(ctx, x + 33 * s, y - 42 * s, 9 * s, '#fff6b0');
    // trail
    for (let i = 1; i <= 12; i++) {
        ctx.fillStyle = `hsla(${hue},100%,85%,${0.7 - i * 0.055})`;
        ctx.beginPath(); ctx.arc(x - 28 * s - i * 11 * s, y + 20 * s + Math.sin(i * 0.9) * 10 * s + i * 2, Math.max(0.8, 3 * s - i * 0.18), 0, TAU); ctx.fill();
    }
}

function fairyNight(ctx) {
    const r = rng(77);
    sky(ctx, [[0, '#070a2b'], [0.45, '#1b1b63'], [0.8, '#4a2a8a'], [1, '#6a3a9d']]);
    screen(ctx, () => {
        glow(ctx, 300, 250, 420, 'rgba(150,80,255,0.35)', 'rgba(0,0,0,0)');
        glow(ctx, 900, 520, 460, 'rgba(60,130,255,0.28)', 'rgba(0,0,0,0)');
        glow(ctx, 640, 330, 360, 'rgba(255,90,190,0.2)', 'rgba(0,0,0,0)');
    });
    stars(ctx, r, 260, 560);
    const pastel = ['#ffffff', '#cfe8ff', '#ffd6f3', '#d6fff1', '#fff2c4'];
    for (let i = 0; i < 18; i++) sparkle(ctx, 30 + r() * (W - 60), 30 + r() * 420, 5 + r() * 9, pastel[i % pastel.length]);
    shootingStar(ctx, 250, 190, 190, 0.5, 3.2); shootingStar(ctx, 1170, 110, 150, 0.42, 2.6); shootingStar(ctx, 760, 70, 120, 0.55, 2.2);

    // moon
    const mx = 1110; const my = 450;
    screen(ctx, () => glow(ctx, mx, my, 330, 'rgba(190,210,255,0.55)', 'rgba(60,80,160,0)'));
    const moon = ctx.createRadialGradient(mx - 24, my - 24, 8, mx, my, 80);
    moon.addColorStop(0, '#ffffff'); moon.addColorStop(0.7, '#e9eeff'); moon.addColorStop(1, '#b9c6ee');
    ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(mx, my, 80, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(120,135,190,0.28)'; for (const [dx, dy, rr] of [[-26, -20, 17], [24, 12, 22], [-10, 36, 12], [34, -34, 9]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, rr, 0, TAU); ctx.fill(); }

    // planets
    planet(ctx, 150, 440, 56, ['#ffe9b0', '#e2a65a', '#6b3f1c'], { ring: true, tilt: -0.4, bands: 6 });
    planet(ctx, 330, 540, 32, ['#ff9b7a', '#d44a2e', '#5a1408']);
    planet(ctx, 880, 500, 40, ['#9ad7ff', '#3f7be0', '#10205e'], { bands: 5 });
    planet(ctx, 460, 420, 16, ['#e6ffd9', '#6fd18b', '#1d5a3a']);

    // dark hills with glowing flowers
    hills(ctx, 640, 26, 41, '#150f3d'); hills(ctx, 680, 22, 47, '#0b0828');
    for (let i = 0; i < 38; i++) {
        const x = r() * W; const y = 668 + r() * 44; const hue = [300, 190, 50, 140][i % 4];
        screen(ctx, () => glow(ctx, x, y, 22, `hsla(${hue},100%,70%,0.8)`, `hsla(${hue},100%,60%,0)`));
        ctx.fillStyle = `hsl(${hue},100%,85%)`; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill();
    }
    // fairies
    fairy(ctx, 600, 470, 1.15, 320); fairy(ctx, 780, 560, 0.95, 190); fairy(ctx, 990, 380, 0.8, 50); fairy(ctx, 330, 330, 0.75, 150);
    for (let i = 0; i < 30; i++) { const x = r() * W; const y = 400 + r() * 280; ctx.fillStyle = `rgba(255,255,200,${0.3 + r() * 0.6})`; ctx.shadowColor = '#fff7a0'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(x, y, 1.6 + r() * 1.6, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
    return { text: '#f6f4ff', shadow: 'rgba(10,5,60,0.85)' };
}

// ─── NIGHT 2 · Moonlit mountains ────────────────────────────────────────────
function moonlitMountains(ctx) {
    const r = rng(77);
    sky(ctx, [[0, '#04081f'], [0.55, '#121c52'], [1, '#2c2f78']]);
    screen(ctx, () => { glow(ctx, 330, 230, 380, 'rgba(120,70,220,0.28)', 'rgba(0,0,0,0)'); glow(ctx, 960, 470, 420, 'rgba(40,120,255,0.22)', 'rgba(0,0,0,0)'); });
    stars(ctx, r, 240, 560);
    for (let i = 0; i < 9; i++) sparkle(ctx, 60 + r() * (W - 120), 50 + r() * 420, 7 + r() * 10, '#dfe8ff');
    shootingStar(ctx, 250, 172, 170, 0.5, 3);
    const mx = 1120; const my = 425;
    screen(ctx, () => glow(ctx, mx, my, 330, 'rgba(190,210,255,0.55)', 'rgba(60,80,160,0)'));
    const moon = ctx.createRadialGradient(mx - 26, my - 26, 8, mx, my, 85);
    moon.addColorStop(0, '#ffffff'); moon.addColorStop(0.7, '#e7edff'); moon.addColorStop(1, '#b9c6ee');
    ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(mx, my, 85, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(120,135,190,0.28)'; for (const [dx, dy, rr] of [[-30, -24, 20], [28, 14, 26], [-12, 40, 14], [38, -38, 11], [-50, 20, 9]]) { ctx.beginPath(); ctx.arc(mx + dx, my + dy, rr, 0, TAU); ctx.fill(); }
    mountains(ctx, 600, 190, 21, '#10173f'); mountains(ctx, 650, 150, 33, '#0a0f2c'); hills(ctx, 690, 22, 17, '#050818');
    for (let i = 0; i < 46; i++) { ctx.fillStyle = `rgba(255,214,120,${0.35 + r() * 0.55})`; ctx.fillRect(40 + r() * (W - 80), 668 + r() * 36, 3, 3); }
    return { text: '#f4f7ff', shadow: 'rgba(5,10,50,0.8)' };
}

// ─── NIGHT 3 · Campfire under the stars ─────────────────────────────────────
function campfireNight(ctx) {
    const r = rng(90);
    sky(ctx, [[0, '#050823'], [0.5, '#14185a'], [1, '#2a2a78']]);

    // Milky Way
    ctx.save(); ctx.translate(W * 0.55, H * 0.3); ctx.rotate(-0.5);
    for (let i = 0; i < 7; i++) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 760); const col = ['rgba(150,120,255,', 'rgba(90,150,255,', 'rgba(255,130,200,'][i % 3];
        g.addColorStop(0, col + '0.16)'); g.addColorStop(1, col + '0)');
        ctx.save(); ctx.scale(1, 0.16 + i * 0.012); ctx.fillStyle = g; ctx.beginPath(); ctx.arc((i - 3) * 90, 0, 760, 0, TAU); ctx.fill(); ctx.restore();
    }
    for (let i = 0; i < 520; i++) {
        const x = (r() - 0.5) * 1500; const y = (r() + r() + r() - 1.5) * 150;
        ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.7})`; ctx.beginPath(); ctx.arc(x, y, r() * 1.5 + 0.3, 0, TAU); ctx.fill();
    }
    ctx.restore();
    stars(ctx, r, 150, 520, 0.3);
    for (let i = 0; i < 12; i++) sparkle(ctx, 40 + r() * (W - 80), 40 + r() * 400, 5 + r() * 8, '#dfe8ff');
    shootingStar(ctx, 220, 160, 180, 0.45, 3);

    mountains(ctx, 560, 150, 61, '#0f1440'); hills(ctx, 590, 20, 63, '#090c2b');
    for (const [x, y, h] of [[70, 640, 300], [150, 652, 220], [1180, 640, 320], [1100, 656, 210], [1245, 652, 230], [250, 660, 160]]) pine(ctx, x, y, h, '#060822');
    hills(ctx, 630, 16, 69, '#05061c');

    // tent
    const tx = 520; const ty = 612;
    ctx.fillStyle = '#d9533a'; ctx.beginPath(); ctx.moveTo(tx - 140, ty); ctx.lineTo(tx, ty - 150); ctx.lineTo(tx + 20, ty - 150); ctx.lineTo(tx + 20, ty); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9b3624'; ctx.beginPath(); ctx.moveTo(tx + 20, ty); ctx.lineTo(tx + 20, ty - 150); ctx.lineTo(tx + 150, ty); ctx.closePath(); ctx.fill();
    ctx.fillStyle = grad(ctx, 0, ty - 100, 0, ty, [[0, '#fff0a0'], [1, '#ff9d3a']]);
    ctx.beginPath(); ctx.moveTo(tx - 50, ty); ctx.lineTo(tx - 4, ty - 100); ctx.lineTo(tx + 20, ty - 100); ctx.lineTo(tx + 20, ty); ctx.closePath(); ctx.fill();
    screen(ctx, () => glow(ctx, tx - 10, ty - 40, 150, 'rgba(255,190,90,0.45)', 'rgba(255,150,60,0)'));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tx - 140, ty); ctx.lineTo(tx - 190, ty + 18); ctx.moveTo(tx + 150, ty); ctx.lineTo(tx + 200, ty + 18); ctx.stroke();

    // campfire
    const fx = 820; const fy = 618;
    screen(ctx, () => glow(ctx, fx, fy - 30, 280, 'rgba(255,150,50,0.55)', 'rgba(255,100,30,0)'));
    ctx.fillStyle = '#4a2b17'; for (const a of [-0.5, 0.5]) { ctx.save(); ctx.translate(fx, fy); ctx.rotate(a); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-52, -7, 104, 14, 7) : ctx.rect(-52, -7, 104, 14); ctx.fill(); ctx.restore(); }
    ctx.globalCompositeOperation = 'lighter';
    flameShape(ctx, fx, fy - 6, 74, 120, [[0, 'rgba(255,60,20,0.95)'], [0.5, 'rgba(255,150,30,0.9)'], [1, 'rgba(255,230,120,0.8)']]);
    flameShape(ctx, fx + 8, fy - 6, 46, 84, [[0, 'rgba(255,120,30,0.95)'], [1, 'rgba(255,245,160,0.9)']]);
    flameShape(ctx, fx - 12, fy - 6, 34, 58, [[0, 'rgba(255,200,60,0.9)'], [1, 'rgba(255,255,220,0.9)']]);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgba(255,${150 + Math.floor(r() * 100)},50,${0.4 + r() * 0.6})`; ctx.shadowColor = '#ff8a1f'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(fx + (r() - 0.5) * 120, fy - 40 - r() * 190, 1 + r() * 2.2, 0, TAU); ctx.fill(); ctx.shadowBlur = 0; }
    return { text: '#f6f4ff', shadow: 'rgba(6,8,50,0.85)' };
}

// ─── NIGHT 4 · Floating lanterns ────────────────────────────────────────────
function lantern(ctx, x, y, s, r) {
    screen(ctx, () => glow(ctx, x, y, 70 * s, 'rgba(255,170,70,0.55)', 'rgba(255,120,40,0)'));
    const w = 22 * s; const h = 30 * s;
    ctx.fillStyle = grad(ctx, 0, y - h, 0, y + h, [[0, '#ffe39a'], [0.5, '#ffa63d'], [1, '#e8561e']]);
    ctx.beginPath(); ctx.moveTo(x - w * 0.8, y - h); ctx.lineTo(x + w * 0.8, y - h); ctx.lineTo(x + w, y + h); ctx.lineTo(x - w, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a2e12'; ctx.fillRect(x - w * 0.8, y - h - 3 * s, w * 1.6, 4 * s); ctx.fillRect(x - w, y + h - 2 * s, w * 2, 4 * s);
    ctx.strokeStyle = 'rgba(120,40,10,0.35)'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x, y + h); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,230,0.55)'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.35, h * 0.55, 0, 0, TAU); ctx.fill();
}

function lanternNight(ctx) {
    const r = rng(52);
    sky(ctx, [[0, '#070a2e'], [0.5, '#1d1b66'], [0.78, '#5a2f85'], [1, '#8a3f8f']]);
    stars(ctx, r, 220, 420);
    for (let i = 0; i < 12; i++) sparkle(ctx, 40 + r() * (W - 80), 30 + r() * 330, 5 + r() * 8, '#e6ecff');
    const mx = 1110; const my = 420;
    screen(ctx, () => glow(ctx, mx, my, 300, 'rgba(255,236,190,0.6)', 'rgba(255,180,120,0)'));
    const moon = ctx.createRadialGradient(mx - 20, my - 20, 6, mx, my, 70);
    moon.addColorStop(0, '#fffdf2'); moon.addColorStop(1, '#ffe7a8');
    ctx.fillStyle = moon; ctx.beginPath(); ctx.arc(mx, my, 70, 0, TAU); ctx.fill();

    // far shore + pagoda
    const horizon = 520;
    hills(ctx, horizon - 6, 12, 71, '#1a1349');
    ctx.fillStyle = '#120d38';
    for (let t = 0; t < 3; t++) { const w = 74 - t * 18; const y = horizon - 22 - t * 26; ctx.beginPath(); ctx.moveTo(250 - w, y); ctx.lineTo(250 + w, y); ctx.lineTo(250 + w - 14, y - 12); ctx.lineTo(250 - w + 14, y - 12); ctx.closePath(); ctx.fill(); ctx.fillRect(250 - w * 0.55, y, w * 1.1, 16); }
    ctx.fillRect(247, horizon - 22 - 3 * 26 - 14, 6, 18);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(255,200,110,${0.3 + r() * 0.6})`; ctx.fillRect(40 + r() * (W - 80), horizon - 14 + r() * 12, 2.5, 2.5); }

    // water
    ctx.fillStyle = grad(ctx, 0, horizon, 0, H, [[0, '#2a2468'], [1, '#080a2a']]); ctx.fillRect(0, horizon, W, H - horizon);
    for (let i = 0; i < 38; i++) { const y = horizon + 8 + i * 5.2; const sp = 40 + i * 4; ctx.fillStyle = `rgba(255,232,170,${Math.max(0, 0.45 - i * 0.011)})`; ctx.fillRect(mx - sp / 2 + (r() - 0.5) * 30, y, sp * (0.4 + r() * 0.6), 2.2); }
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.4;
    for (let i = 0; i < 40; i++) { const y = horizon + 10 + r() * 190; const x = r() * W; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 + r() * 80, y); ctx.stroke(); }

    // lanterns (and their reflections)
    const lanterns = [];
    for (let i = 0; i < 28; i++) lanterns.push([40 + r() * (W - 80), 395 + r() * 135, 0.5 + r() * 0.85]);
    for (let i = 0; i < 8; i++) lanterns.push([(i % 2 ? 1110 + r() * 140 : 30 + r() * 130), 130 + r() * 250, 0.35 + r() * 0.35]);
    for (const [x, y, s] of lanterns) {
        if (y < horizon - 20) {
            const refY = horizon + (horizon - y) * 0.55;
            screen(ctx, () => { const g = ctx.createLinearGradient(0, refY - 30, 0, refY + 30); g.addColorStop(0, 'rgba(255,160,60,0)'); g.addColorStop(0.5, 'rgba(255,170,70,0.35)'); g.addColorStop(1, 'rgba(255,160,60,0)'); ctx.fillStyle = g; ctx.fillRect(x - 8 * s, refY - 30, 16 * s, 60); });
        }
    }
    for (const [x, y, s] of lanterns.sort((a, b) => a[2] - b[2])) lantern(ctx, x, y, s, r);
    return { text: '#fff7ea', shadow: 'rgba(25,10,70,0.85)' };
}

const SCENES = {
    morning: [winterDawn, sunriseHills, mistyLake, goldenMeadow],
    afternoon: [sunnyBeach, sunnyHills, sunflowerField, balloonValley],
    night: [fairyNight, moonlitMountains, campfireNight, lanternNight],
};

module.exports = { SCENES, W, H };
                                         
