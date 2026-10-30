/**
 * What can the chatbot do with media? One table per media kind.
 * The same table drives (1) the numbered menu and (2) understanding free text
 * like "make it a round sticker" or a caption sent with the image.
 */
const IMAGE = [
    { id: 'removebg',  label: 'Remove background',                 re: /(remove|erase|delete|cut\s?out|clear|take\s?off|no)\W{0,3}(the\s+)?(bg|background)|\b(rmbg|removebg|nobg|transparent)\b/i },
    { id: 'sticker',   label: 'Convert to sticker',                re: /^(?!.*(premium|round|circle|circular)).*sticker/i },
    { id: 'psticker',  label: 'Convert to premium sticker 💎',     re: /premium.{0,15}sticker|sticker.{0,15}premium|\bpremium\b/i },
    { id: 'rsticker',  label: 'Convert to round sticker',          re: /(round|circle|circular).{0,15}sticker|sticker.{0,15}(round|circle|circular)|\b(round|circular)\b/i },
    { id: 'ocr',       label: 'Scan the image & return text',      re: /\b(scan|ocr)\b|\b(read|extract|get|copy|grab|pull)\b.{0,15}\btext\b|\btext\b.{0,15}\b(from|in|on|of)\b|what does (it|this) say|what('?s| is) written/i },
    { id: 'describe',  label: 'Describe the image',                re: /describe|what('?s| is| are).{0,20}(this|in|the|here)|explain|analy[sz]e|tell me about|caption/i },
    { id: 'resize',    label: 'Resize the image',                  re: /resize|re-?scale|shrink|enlarge|make.{0,12}(smaller|bigger|larger)|\bscale\b/i },
    { id: 'bw',        label: 'Make it black & white',             re: /black\s*(and|&|n)?\s*white|\bb\s*&\s*w\b|gr[ea]y\s?scale|monochrome/i },
    { id: 'compress',  label: 'Compress it (smaller file)',        re: /compress|reduce.{0,10}size|lower.{0,10}size|smaller file/i },
    { id: 'document',  label: 'Send it as a document (full quality)', re: /document|\bdoc\b|full quality|original quality|uncompressed/i },
];

const STICKER = [
    { id: 'image',     label: 'Convert to image',                  re: /^(?!.*(\bbg\b|background|rmbg|removebg|nobg)).*\b(image|img|photo|picture|pic|png|jpe?g)\b/i },
    { id: 'gif',       label: 'Convert to GIF',                    re: /\bgif\b|video|animat/i },
    { id: 'psticker',  label: 'Convert to premium sticker 💎',     re: /premium/i },
    { id: 'img_nobg',  label: 'Convert to image and remove background', re: /(remove|erase|cut\s?out|no)\W{0,3}(the\s+)?(bg|background)|\b(rmbg|removebg|nobg)\b/i },
    { id: 'describe',  label: 'Describe the sticker',              re: /describe|what('?s| is).{0,20}(this|it|the)|explain|analy[sz]e/i },
    { id: 'repack',    label: 'Re-pack it with my pack name',      re: /\bpack\b|steal|rename|watermark|my sticker/i },
];

const VIDEO = [
    { id: 'sticker',   label: 'Convert to sticker',                re: /^(?!.*premium).*(sticker|\bgif\b)/i },
    { id: 'psticker',  label: 'Convert to premium sticker 💎',     re: /premium/i },
    { id: 'describe',  label: "Describe what's happening",         re: /describe|what('?s| is).{0,20}(this|happening|going)|explain|analy[sz]e/i },
    { id: 'audio',     label: 'Extract the audio (mp3)',           re: /\b(audio|mp3|sound)\b|extract.{0,10}(audio|sound)/i },
    { id: 'transcribe', label: 'Transcribe the speech to text',    re: /transcri|speech|subtitle|what (do|did) (they|he|she).{0,10}say|what('?s| is| are) (he|she|they|being).{0,10}(say|said|saying)|\bspoken\b/i },
    { id: 'song',      label: 'Identify the song',                 re: /\b(song|music|shazam|track|identify)\b/i },
    { id: 'frame',     label: 'Grab a screenshot (first frame)',   re: /screenshot|\bframe\b|thumbnail|snapshot|\bstill\b|\bphoto\b|\bimage\b/i },
];

const TABLES = { image: IMAGE, sticker: STICKER, video: VIDEO };
const CANCEL = /^\s*(cancel|nevermind|never mind|nvm|stop|forget it|no|nope|skip|leave it|ignore)\s*[.!]*\s*$/i;

function menuText(kind) {
    const rows = TABLES[kind].map((a, i) => `${i + 1}. ${a.label}`).join('\n');
    const head = {
        image: '🖼️ Got your image! What do you want me to do with it?',
        sticker: '🧩 Got your sticker! What do you want me to do with it?',
        video: '🎥 Got your video! What do you want me to do with it?',
    }[kind];
    const tail = kind === 'image'
        ? '\n\nReply with a number or just tell me. You can also ask me anything about the image.'
        : '\n\nReply with a number or just tell me what you want.';
    return `${head}\n\n${rows}${tail}`;
}

/** → { id } | { cancel:true } | null */
function resolve(kind, text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (CANCEL.test(t)) return { cancel: true };
    const table = TABLES[kind];
    const num = t.match(/^(?:#|no\.?\s*)?(\d{1,2})\s*[.)!]?$/i);
    if (num) {
        const a = table[+num[1] - 1];
        return a ? { id: a.id } : null;
    }
    for (const a of table) if (a.re.test(t)) return { id: a.id };
    return null;
}

module.exports = { TABLES, menuText, resolve, CANCEL };
