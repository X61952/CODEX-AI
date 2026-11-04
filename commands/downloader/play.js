'use strict';

const yts = require('yt-search');
const { fetchMedia, sendMedia, friendlyError, safeName } = require('../../lib/socialdl');

const MAX_SONG_SECONDS = 30 * 60;

function videoIdOf(text) {
    return text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i)?.[1] || null;
}

module.exports = {
    name: 'play',
    alias: ['song', 'music'],
    desc: 'Download and send YouTube music',
    category: 'downloader',
    reactions: { start: '⏰' },

    execute: async (sock, m, { reply, args, prefix }) => {
        const query = args.join(' ').trim();
        if (!query) {
            return await reply(`_*provide a query*_\n_❡ example: ${prefix}play unstoppable_`);
        }

        let media;
        try {
            // Search YouTube (or look up the video if a link was given)
            const id = videoIdOf(query);
            const ytsa = id ? await yts({ videoId: id }) : (await yts(query)).videos[0];

            if (!ytsa) {
                return await reply('❌ No results found for: ' + query);
            }

            const seconds = Number(ytsa.seconds) || Number(ytsa.duration?.seconds) || 0;
            if (seconds > MAX_SONG_SECONDS) {
                return await reply(`❌ That track is too long (max ${MAX_SONG_SECONDS / 60} minutes).\n*${ytsa.title}*`);
            }

            const url = ytsa.url || `https://www.youtube.com/watch?v=${id}`;
            media = await fetchMedia(url, { audioOnly: true });

            const stamp = ytsa.duration?.timestamp || ytsa.timestamp || '?';
            const cap = `*${ytsa.title}*\n\n00:00 ───◁ㅤ ❚❚ ㅤ▷─── ${stamp} ♡`;
            const thumb = ytsa.thumbnail || ytsa.image;

            // 1. Thumbnail WITH the caption
            if (thumb) {
                await (sock.sock || sock).sendMessage(m.chat, {
                    image: { url: thumb },
                    caption: cap
                }, { quoted: m }).catch(() => reply(cap));
            } else {
                await reply(cap);
            }

            // 2. The audio file right below it
            await sendMedia(sock, m, media, { name: safeName(ytsa.title, 'song') });

        } catch (err) {
            console.error('[play]', err?.message || err);
            return await reply(friendlyError(err));
        } finally {
            media?.cleanup();
        }
    }
};
