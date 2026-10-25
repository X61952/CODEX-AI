// Auto-read scope: 'all' (default) · 'dm' (private chats only) · 'group' (group chats only).
function autoReadAllows(config, jid) {
    if (!config?.autoRead) return false;
    const mode = String(config.autoReadMode || 'all').toLowerCase();
    const isGroup = String(jid || '').endsWith('@g.us');
    if (mode === 'dm') return !isGroup;
    if (mode === 'group') return isGroup;
    return true;
}
module.exports = { autoReadAllows };
