// AntiBug — detection side of the AntiBug anti-system (lib/antiSystems.js#checkBug).
//
// Pure, dependency-free and cheap: it only inspects the raw Baileys message
// object (no network, no disk), so it can run on EVERY incoming message in
// every chat without slowing the bot down. Normal messages exit after a few
// property reads. This file only DETECTS; what happens next (delete, block,
// kick, log) lives in AntiSystems so the action stays in one place.
//
// What it recognises (all defensive — nothing here builds or sends payloads):
//   1. Huge newsletter/channel admin invites
//   2. Sticker-pack flooding (and oversized sticker packs)
//   3. Status-mention flooding (private chat / group status mention spam)
//   4. File (document) flooding + documents with absurd metadata
//   5. Oversized text / invisible-character walls / mention walls
//   6. Oversized interactive / list / button / template / order / payment bodies
//   7. Oversized vCards, locations, polls, events, group invites, ad-reply data
//   8. Absurd media metadata (page count, dimensions, thumbnail size)
//   9. Deeply nested wrappers and generally enormous message trees
//  10. Flooding of heavy structured message types in a short time

'use strict';

const LIMITS = {
    text:            12000,   // chars in one text/caption (WhatsApp UI itself caps near 65k)
    invisibleChars:  800,     // zero-width / bidi-control / combining marks in one text
    mentions:        1500,    // mentionedJid entries (a group can't legitimately exceed ~1k)
    fileName:        500,
    metaString:      2000,    // title/name/description/address/caption-type fields
    vcard:           12000,
    interactiveBody: 4000,
    interactiveJson: 12000,   // nativeFlow params / buttons payload
    buttons:         25,
    listRows:        120,
    pollOptions:     12,      // WhatsApp's own maximum
    stickersInPack:  60,
    pageCount:       50000,
    mediaDimension:  30000,
    thumbnailBytes:  300000,
    fileLength:      4e9,
    nestDepth:       4,
    treeStringChars: 160000,  // total string chars across the whole message tree
    treeNodes:       4000,
};

// Flood rules: [key, windowMs, maxCount] — hitting maxCount inside windowMs
// from ONE sender is a flood.
const FLOODS = {
    channelInvite: [30000, 2],
    stickerPack:   [15000, 3],
    statusMention: [30000, 3],
    file:          [8000,  5],
    heavy:         [10000, 4],
};

const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/g;

const WRAPPERS = [
    'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension',
    'documentWithCaptionMessage', 'editedMessage', 'botInvokeMessage', 'lottieStickerMessage',
    'associatedChildMessage', 'groupMentionedMessage', 'questionMessage',
];

const HEAVY_TYPES = new Set([
    'interactiveMessage', 'nativeFlowMessage', 'buttonsMessage', 'listMessage', 'templateMessage',
    'highlyStructuredMessage', 'orderMessage', 'productMessage', 'invoiceMessage',
    'requestPaymentMessage', 'sendPaymentMessage', 'paymentInviteMessage', 'productListMessage',
]);

function len(v) {
    if (v == null) return 0;
    if (typeof v === 'string') return v.length;
    if (typeof v.length === 'number') return v.length;        // Buffer / Uint8Array / array
    return 0;
}

// Unwrap ephemeral / view-once / caption wrappers. Returns the innermost
// content object and how deep the wrapping went.
function unwrap(message) {
    let cur = message;
    let depth = 0;
    for (let i = 0; i < 12 && cur && typeof cur === 'object'; i++) {
        let next = null;
        for (const w of WRAPPERS) {
            const inner = cur[w]?.message;
            if (inner && typeof inner === 'object') { next = inner; break; }
        }
        if (!next) break;
        cur = next;
        depth++;
    }
    return { inner: cur || {}, depth };
}

// Counts total string characters / nodes in the tree, bailing out early once
// a budget is blown so a hostile message can't make the scan itself slow.
function treeStats(root) {
    let chars = 0;
    let nodes = 0;
    const stack = [root];
    while (stack.length) {
        const cur = stack.pop();
        if (cur == null) continue;
        if (++nodes > LIMITS.treeNodes) return { chars, nodes, blown: true };
        const t = typeof cur;
        if (t === 'string') { chars += cur.length; }
        else if (t === 'object') {
            if (typeof cur.length === 'number' && cur.buffer) { chars += cur.length; continue; }   // typed array / Buffer
            if (Array.isArray(cur)) { for (const v of cur) stack.push(v); }
            else { for (const k in cur) stack.push(cur[k]); }
        }
        if (chars > LIMITS.treeStringChars) return { chars, nodes, blown: true };
    }
    return { chars, nodes, blown: false };
}

function ctxOf(node) {
    return node?.contextInfo || null;
}

function checkMentions(node) {
    const c = ctxOf(node);
    if (c && len(c.mentionedJid) > LIMITS.mentions) return `mention wall (${len(c.mentionedJid)} mentions)`;
    if (c && len(c.groupMentions) > LIMITS.mentions) return 'group-mention wall';
    const ad = c?.externalAdReply;
    if (ad && (len(ad.title) > LIMITS.metaString || len(ad.body) > LIMITS.metaString ||
               len(ad.sourceUrl) > LIMITS.metaString || len(ad.mediaUrl) > LIMITS.metaString)) {
        return 'oversized ad-reply data';
    }
    return null;
}

function trackFlood(floods, sender, kind, now) {
    const [windowMs, max] = FLOODS[kind];
    const key = `${sender}|${kind}`;
    let arr = floods.get(key);
    if (!arr) { arr = []; floods.set(key, arr); }
    arr.push(now);
    while (arr.length && now - arr[0] > windowMs) arr.shift();
    if (arr.length >= max) { floods.delete(key); return true; }
    return false;
}

/**
 * @param {object} message  raw m.message from Baileys
 * @param {object} ctx      { sender: string, floods: Map, now?: number }
 * @returns {string|null}   human-readable reason when the message is a bug/flood
 */
function detectBug(message, ctx = {}) {
    if (!message || typeof message !== 'object') return null;
    const now = ctx.now || Date.now();
    const sender = ctx.sender || 'unknown';
    const floods = ctx.floods || new Map();

    const { inner, depth } = unwrap(message);
    if (depth > LIMITS.nestDepth) return `deeply nested message (${depth} layers)`;

    const type = Object.keys(inner).find((k) => k !== 'messageContextInfo' && k !== 'senderKeyDistributionMessage') || '';

    // ── Fast path: ordinary text ────────────────────────────────────────────
    if (type === 'conversation' || type === 'extendedTextMessage') {
        const node = inner[type];
        const text = typeof node === 'string' ? node : (node?.text || '');
        if (text.length > LIMITS.text) return `text wall (${text.length} chars)`;
        if (text.length > 200) {
            const hidden = (text.match(INVISIBLE_RE) || []).length;
            if (hidden > LIMITS.invisibleChars || hidden > text.length * 0.6) return `invisible-character wall (${hidden})`;
        }
        if (typeof node === 'object') {
            const bad = checkMentions(node);
            if (bad) return bad;
            if (len(node.title) > LIMITS.metaString || len(node.description) > LIMITS.metaString ||
                len(node.matchedText) > LIMITS.metaString || len(node.canonicalUrl) > LIMITS.metaString) {
                return 'oversized link preview';
            }
            if (len(node.jpegThumbnail) > LIMITS.thumbnailBytes) return 'oversized thumbnail';
        }
        return null;
    }

    const node = inner[type];
    if (!node || typeof node !== 'object') return null;

    // ── 1. Huge channel (newsletter) admin invite + flood ───────────────────
    if (type === 'newsletterAdminInviteMessage') {
        if (len(node.caption) > 500 || len(node.newsletterName) > 300 || len(node.jpegThumbnail) > LIMITS.thumbnailBytes) {
            return 'huge channel admin invite';
        }
        if (trackFlood(floods, sender, 'channelInvite', now)) return 'channel admin invite flooding';
        return null;
    }

    // ── 2. Sticker pack flooding / oversized pack ───────────────────────────
    if (type === 'stickerPackMessage') {
        if (len(node.stickers) > LIMITS.stickersInPack || len(node.name) > 300 ||
            len(node.publisher) > 300 || len(node.description) > LIMITS.metaString) {
            return 'oversized sticker pack';
        }
        if (trackFlood(floods, sender, 'stickerPack', now)) return 'sticker pack flooding';
        return null;
    }

    // ── 3. Status-mention flooding (private chats and groups) ───────────────
    const isStatusMention =
        type === 'statusMentionMessage' || type === 'groupStatusMentionMessage' ||
        type === 'statusMentions' || type === 'statusMentionMessageV2' ||
        (type === 'protocolMessage' && node.type === 25);
    if (isStatusMention) {
        const bad = checkMentions(node) || checkMentions(node.message?.[Object.keys(node.message || {})[0]]);
        if (bad) return `huge status mention (${bad})`;
        if (trackFlood(floods, sender, 'statusMention', now)) return 'status mention flooding';
        return null;
    }

    // ── 4. File flooding + documents with absurd metadata ───────────────────
    if (type === 'documentMessage') {
        if (len(node.fileName) > LIMITS.fileName || len(node.title) > LIMITS.metaString ||
            len(node.caption) > LIMITS.text) {
            return 'document with oversized name/title';
        }
        if (Number(node.pageCount) > LIMITS.pageCount) return `document with absurd page count (${node.pageCount})`;
        if (Number(node.fileLength) > LIMITS.fileLength) return 'document with absurd file size';
        if (len(node.jpegThumbnail) > LIMITS.thumbnailBytes) return 'document with oversized thumbnail';
        const bad = checkMentions(node);
        if (bad) return bad;
        if (trackFlood(floods, sender, 'file', now)) return 'file flooding';
        return null;
    }

    // ── 8. Absurd media metadata ────────────────────────────────────────────
    if (type === 'imageMessage' || type === 'videoMessage' || type === 'ptvMessage' || type === 'stickerMessage') {
        if (Number(node.height) > LIMITS.mediaDimension || Number(node.width) > LIMITS.mediaDimension) {
            return `media with absurd dimensions (${node.width}x${node.height})`;
        }
        if (len(node.jpegThumbnail) > LIMITS.thumbnailBytes) return 'media with oversized thumbnail';
        if (len(node.caption) > LIMITS.text) return `caption wall (${len(node.caption)} chars)`;
        if (Number(node.fileLength) > LIMITS.fileLength) return 'media with absurd file size';
        return checkMentions(node);
    }
    if (type === 'audioMessage') {
        if (len(node.waveform) > 5000) return 'audio with oversized waveform';
        if (Number(node.fileLength) > LIMITS.fileLength) return 'audio with absurd file size';
        return checkMentions(node);
    }

    // ── 7. Oversized vCards / locations / polls / events / invites ──────────
    if (type === 'contactMessage') {
        if (len(node.vcard) > LIMITS.vcard || len(node.displayName) > LIMITS.metaString) return 'oversized contact card';
        return null;
    }
    if (type === 'contactsArrayMessage') {
        const list = node.contacts || [];
        if (list.length > 50) return `contact card flood (${list.length} cards)`;
        for (const c of list) if (len(c?.vcard) > LIMITS.vcard) return 'oversized contact card';
        return null;
    }
    if (type === 'locationMessage' || type === 'liveLocationMessage') {
        if (len(node.name) > LIMITS.metaString || len(node.address) > LIMITS.metaString ||
            len(node.caption) > LIMITS.metaString || len(node.url) > LIMITS.metaString) {
            return 'oversized location data';
        }
        const lat = Number(node.degreesLatitude), lng = Number(node.degreesLongitude);
        if ((node.degreesLatitude !== undefined && (!Number.isFinite(lat) || Math.abs(lat) > 90)) ||
            (node.degreesLongitude !== undefined && (!Number.isFinite(lng) || Math.abs(lng) > 180))) {
            return 'invalid location coordinates';
        }
        return null;
    }
    if (/^pollCreationMessage/.test(type)) {
        if (len(node.options) > LIMITS.pollOptions || len(node.name) > LIMITS.metaString) return 'oversized poll';
        for (const o of node.options || []) if (len(o?.optionName) > 500) return 'oversized poll';
        return null;
    }
    if (type === 'eventMessage') {
        if (len(node.name) > LIMITS.metaString || len(node.description) > LIMITS.text) return 'oversized event';
        return null;
    }
    if (type === 'groupInviteMessage') {
        if (len(node.caption) > LIMITS.metaString || len(node.groupName) > LIMITS.metaString) return 'oversized group invite';
        return null;
    }

    // ── 6 + 10. Interactive / list / button / template / order / payment ────
    if (HEAVY_TYPES.has(type)) {
        const nf = node.nativeFlowMessage || node;
        if (len(node.body?.text) > LIMITS.interactiveBody || len(node.header?.title) > LIMITS.interactiveBody ||
            len(node.footer?.text) > LIMITS.interactiveBody || len(node.contentText) > LIMITS.interactiveBody ||
            len(node.description) > LIMITS.interactiveBody || len(node.title) > LIMITS.interactiveBody) {
            return 'oversized interactive message body';
        }
        if (len(nf.messageParamsJson) > LIMITS.interactiveJson) return 'oversized interactive payload';
        const buttons = nf.buttons || node.buttons || [];
        if (len(buttons) > LIMITS.buttons) return `button flood (${buttons.length})`;
        for (const b of buttons) {
            if (len(b?.buttonParamsJson) > LIMITS.interactiveJson) return 'oversized button payload';
        }
        let rows = 0;
        for (const s of node.sections || []) rows += len(s?.rows);
        if (rows > LIMITS.listRows) return `list flood (${rows} rows)`;
        for (const k of ['note', 'message', 'orderTitle', 'itemCount']) {
            if (len(node[k]) > LIMITS.metaString) return 'oversized order/payment data';
        }
        const bad = checkMentions(node) || checkMentions(node.nativeFlowMessage);
        if (bad) return bad;
        if (trackFlood(floods, sender, 'heavy', now)) return 'structured-message flooding';
        // fall through to the generic tree-size check below
    }

    // ── Generic: enormous message tree (catches types not listed above) ─────
    const bad = checkMentions(node);
    if (bad) return bad;
    const stats = treeStats(inner);
    if (stats.blown) return `enormous message (${stats.chars} chars / ${stats.nodes}+ nodes)`;
    return null;
}

module.exports = { detectBug, trackFlood, unwrap, LIMITS, FLOODS };
