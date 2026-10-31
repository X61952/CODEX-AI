/**
 * "Restart Complete" notice. .restart and .update (when it restarts the bot) leave a
 * small marker file; as soon as the bot is connected again it sends the matching
 * message to the chat the command was used in, then removes the marker.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');
const FILE = path.join(ROOT, 'database', 'restartNotice.json');
const MAX_AGE_MS = 15 * 60 * 1000;

const MESSAGES = {
    restart: '_Restart Complete ✓_\n\n*BOT IS ONLINE AGAIN ✅*',
    update: '_Restart Complete ✓_\n\n*BOT IS NOW UP TO DATE ✅*',
};

/** Call right before the bot exits. type: 'restart' | 'update' */
function mark(type, chat) {
    if (!MESSAGES[type] || !chat) return false;
    try {
        fs.mkdirSync(path.dirname(FILE), { recursive: true });
        fs.writeFileSync(FILE, JSON.stringify({ type, chat, at: Date.now() }));
        return true;
    } catch { return false; }
}

/** Call when the connection opens. Sends the notice once, if one is waiting. */
async function deliver(bot) {
    let note;
    try {
        note = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch { return false; }
    try { fs.unlinkSync(FILE); } catch { /* already gone */ }
    if (!note?.chat || !MESSAGES[note.type] || Date.now() - (note.at || 0) > MAX_AGE_MS) return false;
    try {
        await bot.sock.sendMessage(note.chat, { text: MESSAGES[note.type] });
        return true;
    } catch (e) {
        console.error('[restart notice]', e.message);
        return false;
    }
}

module.exports = { mark, deliver, MESSAGES, FILE };
