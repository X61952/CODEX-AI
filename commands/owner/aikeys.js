/**
 * .aikeys — shows which AI keys the bot can see, and can test them.
 *
 * Keys are NOT typed here (so they never sit in chat history). Put them in your
 * panel's environment variables, or use .setvar once and delete the message:
 *   GROQ_API_KEY        https://console.groq.com/keys
 *   OPENROUTER_API_KEY  https://openrouter.ai/keys
 */
const engine = require('../../lib/ai/engine');
const { MODELS } = require('../../lib/ai/models');

module.exports = {
    name: 'aikeys',
    aliases: ['aistatus', 'aiapi'],
    category: 'owner',
    description: 'Check / test the Groq + OpenRouter AI keys',
    usage: '.aikeys [test]',
    ownerOnly: true,
    reactions: { start: '🔑' },

    async execute(bot, m, args) {
        const p = bot.prefix || '.';
        const providers = ['groq', 'openrouter'];
        const doTest = (args[0] || '').toLowerCase() === 'test';
        const lines = [];

        for (const prov of providers) {
            const key = engine.getKey(bot, prov);
            let status = key ? `\`${engine.mask(key)}\`` : (prov === 'groq' ? '❌ not set (must start with gsk_)' : '❌ not set');
            if (doTest && key) {
                const r = await engine.ping(bot, prov);
                status += r.ok ? ` ✅ key works (${r.models.length} models)` : ` ❌ ${r.error}`;
                if (r.ok && prov === 'groq' && !r.models.includes('openai/gpt-oss-120b')) {
                    status += `\n   ⚠️ openai/gpt-oss-120b isn't on your account. Pick one: ${r.models.filter((x) => /gpt-oss|qwen|llama/.test(x)).slice(0, 6).join(', ')}\n   then: ${p}setvar AI_MODEL_CHATBOT=<model>  and  ${p}setvar AI_MODEL_GPTOSS=<model>`;
                }
            }
            lines.push(`• *${prov.toUpperCase()}*: ${status}`);
        }

        const cmds = Object.keys(MODELS).map((k) => `${p}${k}`).join('  ');
        return await m.reply(
`🔑 *CODEX AI — KEYS*

${lines.join('\n')}

*Where to put them*
Panel → Startup/Variables (or .env):
GROQ_API_KEY=gsk_...
OPENROUTER_API_KEY=sk-or-...
Or once from WhatsApp: ${p}setvar GROQ_API_KEY=gsk_...

${doTest ? '' : `Run *${p}aikeys test* to ping each key.\n\n`}*12 AI commands*
${cmds}`);
    },
};
