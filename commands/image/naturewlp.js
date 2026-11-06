'use strict';

const sharp = require('sharp');
const { guard, CAPTION } = require('../../lib/imageKit');
const { sendPhotos } = require('../../lib/socialdl');

// Wallhaven's public search API (no key needed for SFW wallpapers).
const API = 'https://wallhaven.cc/api/v1/search';
const COUNT = 6;
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;

async function searchWallpapers(query) {
    const params = new URLSearchParams({
        q: query,
        categories: '111',
        purity: '100',            // SFW only
        sorting: query === 'nature' ? 'random' : 'relevance',
        atleast: '1280x720',
        ratios: 'landscape',
    });
    const res = await fetch(`${API}?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Wallpaper search returned HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
}

function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

async function fetchBytes(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(40000), redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) throw new Error('too large');
    return Buffer.from(await res.arrayBuffer());
}

/** Full-size image when reasonable, otherwise the preview; always returned as a WhatsApp-friendly JPEG. */
async function loadWallpaper(item) {
    let raw;
    try { raw = await fetchBytes(item.path); }
    catch { raw = await fetchBytes(item.thumbs?.original || item.thumbs?.large); }
    const buffer = await sharp(raw, { failOn: 'none' })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer();
    return { buffer, mimetype: 'image/jpeg', resolution: item.resolution || '' };
}

module.exports = {
    name: 'naturewlp',
    aliases: ['wallpaper', 'wlp'],
    category: 'image',
    reactions: { start: '⏳' },
    description: 'Send a set of HD wallpapers as an album (default: nature).',
    usage: '.naturewlp [topic]',

    async execute(bot, m, args) {
        return guard(m, async () => {
            const query = args.join(' ').trim().slice(0, 60) || 'nature';
            const results = await searchWallpapers(query);
            if (!results.length) return m.reply(`No wallpapers found for "${query}". Try another topic.`);

            const picks = shuffle(results).slice(0, COUNT);
            const settled = await Promise.allSettled(picks.map(loadWallpaper));
            const images = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
            if (!images.length) throw new Error('The wallpapers could not be downloaded right now. Try again in a moment.');

            const list = images.map((img, i) => `${i + 1}. ${img.resolution}`).join('\n');
            const caption = `*${query.toUpperCase()} WALLPAPERS*\n${list}\n\n${CAPTION}`;
            await sendPhotos(bot, m, { images, total: images.length }, caption);
        });
    },
};
