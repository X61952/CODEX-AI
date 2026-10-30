/** Remembers "what should I do with this media?" per chat+sender for 5 minutes. */
const store = new Map();
const TTL_MS = 5 * 60 * 1000;

const set = (key, value) => store.set(key, { ...value, expires: Date.now() + TTL_MS });
function get(key) {
    const v = store.get(key);
    if (!v) return null;
    if (Date.now() > v.expires) { store.delete(key); return null; }
    return v;
}
const clear = (key) => store.delete(key);

const _t = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) if (now > v.expires) store.delete(k);
}, TTL_MS);
_t.unref?.();

module.exports = { set, get, clear };
