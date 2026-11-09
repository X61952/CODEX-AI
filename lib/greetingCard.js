'use strict';

/**
 * Greeting cards (1280x720): four scenes for each time of day (see
 * lib/greetingScenes.js), with the greeting, the name and the local time written
 * on top. Rendered with the image engine (canvas + embedded fonts), no web APIs.
 */

const {
    font, createCanvas, vignette, grain, roundRectPath, fitSize, drawSpaced, encode,
} = require('./imageKit');
const { SCENES: SCENE_LIST } = require('./greetingScenes');

const W = 1280;
const H = 720;

const SCENES = {
    morning: { title: 'GOOD MORNING', kicker: 'RISE  &  SHINE' },
    afternoon: { title: 'GOOD AFTERNOON', kicker: 'KEEP  GLOWING' },
    night: { title: 'GOOD NIGHT', kicker: 'SWEET  DREAMS' },
};

const KICKERS = {
    morning: ['RISE  &  SHINE', 'A  NEW  DAY', 'FRESH  START', 'HELLO  SUNSHINE'],
    afternoon: ['KEEP  GLOWING', 'STAY  BRIGHT', 'ENJOY  THE  SUN', 'SHINE  ON'],
    night: ['SWEET  DREAMS', 'REST  WELL', 'STARRY  NIGHT', 'SLEEP  TIGHT'],
};

function designCount(slot) {
    return (SCENE_LIST[slot] || SCENE_LIST.morning).length;
}

/**
 * slot:   'morning' | 'afternoon' | 'night'
 * info:   { name, time: '7:00 AM', date: 'Saturday, 7 November', zone: 'Africa/Lagos (GMT+1)', design: 0-based }
 */
function renderGreetingCard(slot, info = {}) {
    const scene = SCENES[slot] || SCENES.morning;
    const list = SCENE_LIST[slot] || SCENE_LIST.morning;
    const index = ((Number(info.design) || 0) % list.length + list.length) % list.length;
    const kickers = KICKERS[slot] || KICKERS.morning;
    const kicker = kickers[index % kickers.length];

    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    const tone = list[index](ctx);

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

    // kicker
    ctx.font = font.medium(36); ctx.fillStyle = tone.text; ctx.globalAlpha = 0.92;
    ctx.shadowColor = tone.shadow; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
    drawSpaced(ctx, kicker, W / 2, 130, 12);
    ctx.globalAlpha = 1;

    // title
    const size = fitSize(ctx, scene.title, font.bold, W * 0.86, 150, 60);
    ctx.font = font.bold(size);
    ctx.shadowColor = tone.shadow; ctx.shadowBlur = 36; ctx.shadowOffsetY = 8;
    ctx.fillStyle = tone.text; ctx.fillText(scene.title, W / 2, 130 + 30 + size * 0.8);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.save(); ctx.beginPath(); ctx.rect(0, 130 + 30, W, size * 0.28); ctx.clip(); ctx.font = font.bold(size); ctx.fillText(scene.title, W / 2, 130 + 30 + size * 0.8); ctx.restore();

    // name
    let y = 130 + 30 + size * 0.8 + 92;
    if (info.name) {
        const label = String(info.name).slice(0, 28);
        const nSize = fitSize(ctx, label, font.medium, W * 0.7, 62, 30);
        ctx.font = font.medium(nSize); ctx.fillStyle = tone.text;
        ctx.shadowColor = tone.shadow; ctx.shadowBlur = 20; ctx.shadowOffsetY = 4;
        ctx.fillText(label, W / 2, y);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        y += 18;
    }

    // time chip
    if (info.time) {
        ctx.font = font.bold(30);
        const timeW = ctx.measureText(info.time).width;
        ctx.font = font.medium(24);
        const dateText = [info.date, info.zone].filter(Boolean).join('   ·   ');
        const dateW = ctx.measureText(dateText).width;
        const cw = Math.min(W - 120, timeW + dateW + 100); const ch = 58;
        const cx = (W - cw) / 2; const cy = H - 92;
        roundRectPath(ctx, cx, cy, cw, ch, 29);
        ctx.fillStyle = 'rgba(8,10,30,0.5)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = font.bold(30); ctx.fillStyle = '#fff'; ctx.fillText(info.time, cx + 30, cy + ch / 2 + 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(cx + 30 + timeW + 20, cy + 15, 2, ch - 30);
        ctx.font = font.medium(24); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillText(dateText, cx + 30 + timeW + 40, cy + ch / 2 + 2);
    }

    vignette(ctx, W, H, 0.34);
    grain(ctx, W, H, 0.03, 9);
    return encode(c, 'jpeg', 93);
}

module.exports = { renderGreetingCard, SCENES, designCount };
