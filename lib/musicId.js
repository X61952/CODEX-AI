/**
 * musicId — real song identification via the Shazam RapidAPI
 * (shazam-song-recognition-api.p.rapidapi.com).
 *
 * Needs your own RapidAPI key: sign up at https://rapidapi.com, subscribe to
 * "Shazam Song Recognition API", then set it with:
 *   .setvar RAPIDAPI_KEY=<key>
 * or the RAPIDAPI_KEY environment variable.
 *
 * Returns METADATA ONLY (title/artist/cover/Shazam link) — never lyrics text.
 *
 * NOTE: I confirmed the `recognize/url` GET endpoint from what you pasted,
 * but I could not verify the exact file-upload endpoint/field name for this
 * specific RapidAPI listing without dashboard access — `recognize/file` with
 * a `file` form field is the common pattern other Shazam-wrapper APIs in this
 * family use. If it 404s or errors for you, check the "Endpoints" tab on your
 * RapidAPI dashboard for the exact path/field name and tell me — one-line fix.
 */
const axios = require('axios');
const FormData = require('form-data');

const HOST = 'shazam-song-recognition-api.p.rapidapi.com';

function _headers(bot) {
    const key = bot?.config?.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY;
    return key ? { 'x-rapidapi-key': key, 'x-rapidapi-host': HOST } : null;
}

function isConfigured(bot) {
    return !!(bot?.config?.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY);
}

function _parseResult(data) {
    const track = data?.track || data?.result || data;
    if (!track || (!track.title && !track.subtitle)) return null;
    return {
        title:     track.title    || null,
        artist:    track.subtitle || track.artist || null,
        coverArt:  track.images?.coverart || track.images?.background || null,
        shazamUrl: track.url || null,
    };
}

/** Identify a song from a local audio buffer (extracted from a video/voice note). */
async function identifySong(bot, audioBuffer) {
    if (!audioBuffer || !audioBuffer.length) return null;
    const headers = _headers(bot);
    if (!headers) return null;

    try {
        const form = new FormData();
        form.append('file', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
        const { data } = await axios.post(`https://${HOST}/recognize/file`, form, {
            headers: { ...headers, ...form.getHeaders() },
            timeout: 30000,
        });
        return _parseResult(data);
    } catch (e) {
        console.error('[musicId] file recognize failed:', e.response?.data || e.message);
        return null;
    }
}

/** Identify a song from a public audio URL. */
async function identifySongFromUrl(bot, url) {
    const headers = _headers(bot);
    if (!headers || !url) return null;
    try {
        const { data } = await axios.get(`https://${HOST}/recognize/url`, {
            headers,
            params: { url },
            timeout: 30000,
        });
        return _parseResult(data);
    } catch (e) {
        console.error('[musicId] url recognize failed:', e.response?.data || e.message);
        return null;
    }
}

module.exports = { identifySong, identifySongFromUrl, isConfigured };
