'use strict';

const yts = require('yt-search');
const { fetchMedia, sendMedia, friendlyError, safeName } = require('../../lib/socialdl');
const { getYouTubeAudio, extractYouTubeId } = require('../../lib/ytaudio');

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

            const videoId = id || ytsa.videoId || extractYouTubeId(ytsa.url);
            const url = ytsa.url || `https://www.youtube.com/watch?v=${videoId}`;

            // 1. Converter providers first (works on hosts where YouTube blocks yt-dlp)
            // 2. social-dl as the fallback
            let audio = null;
            try {
                audio = await getYouTubeAudio(videoId);
            } catch (err) {
                console.warn('[play] converters failed, trying social-dl:', err.message);
                media = await fetchMedia(url, { audioOnly: true });
            }

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
            if (audio) {
                await (sock.sock || sock).sendMessage(m.chat, {
                    audio: audio.buffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: `${safeName(ytsa.title, 'song')}.mp3`
                }, { quoted: m });
            } else {
                await sendMedia(sock, m, media, { name: safeName(ytsa.title, 'song') });
            }

        } catch (err) {
            console.error('[play]', err?.message || err);
            return await reply(friendlyError(err));
        } finally {
            media?.cleanup();
        }
    }
};
