'use strict';
const axios = require('axios');
 
const SIGNS = ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
const EMOJIS = { aries:'â™ˆ',taurus:'â™‰',gemini:'â™Š',cancer:'â™‹',leo:'â™Œ',virgo:'â™',libra:'â™Ž',scorpio:'â™',sagittarius:'â™',capricorn:'â™‘',aquarius:'â™’',pisces:'â™“' };
 
module.exports = {
    commands:    ['horoscope', 'zodiac', 'horo'],
    category: 'economy',
    description: 'Get daily horoscope for a zodiac sign',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, groupId, contextInfo }) => {
        const chatId = groupId || sender;
        const sign   = (args[0] || '').toLowerCase();
        if (!sign || !SIGNS.includes(sign)) {
            return sock.sendMessage(chatId, {
                text: `ðŸ”® *Usage:* .horoscope <sign>\n\n*Signs:* ${SIGNS.join(', ')}\n\nExample: .horoscope leo`,
                contextInfo
            }, { quoted: message });
        }
        try {
            const { data } = await axios.get(
                `https://freehoroscopeapi.com/api/v1/get-horoscope/daily?sign=${sign}&day=TODAY`,
                { timeout: 10000 }
            );
            const h    = data?.data;
            const date = h?.date || new Date().toDateString();
            const text = h?.horoscope_data || 'No horoscope available today.';
            await sock.sendMessage(chatId, {
                text: `${EMOJIS[sign]} *${sign.charAt(0).toUpperCase() + sign.slice(1)} Daily Horoscope*\nðŸ“… ${date}\n\n${text}\n\n_Powered by CODEX AI_`,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `âŒ Horoscope failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};
