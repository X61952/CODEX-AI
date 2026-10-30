/**
 * CODEX AI — model registry (the 12 AI commands).
 *
 * Everything is routed through the only two keys used:
 *   • OPENROUTER_API_KEY  → every "big brand" model (Gemini, GPT, Claude, ...)
 *   • GROQ_API_KEY        → Llama / GPT-OSS (fast) + chatbot + voice notes + vision
 *
 * If a model's route fails (slug retired, key missing, provider down) the engine
 * falls back to Groq Llama so a command never just dies.
 *
 * If a command's model can't be reached it falls back to a Groq model, answering in
 * that command's own style (see `style`), so the commands never just fail.
 *
 * Want a different model behind a command? No code change needed:
 *   .setvar AI_MODEL_GEMINI=google/gemini-3-flash-preview
 *   (key = AI_MODEL_<COMMAND NAME IN CAPS>, value = an OpenRouter slug — or a
 *    Groq model id for the two Groq-native commands, llama and gptoss)
 */
const MODELS = {
    gemini:   { label: 'Gemini',     symbol: '✦', aliases: ['gem'],               or: 'google/gemini-2.5-flash',      vision: true,  info: 'Google Gemini 2.5 Flash',
                style: 'clear, friendly, well organised and practical; balanced and good with facts and explanations' },
    gptmini:  { label: 'GPT Mini',   symbol: '◇', aliases: ['gpt5mini', 'mini'],  or: 'openai/gpt-5-mini',            vision: true,  info: 'OpenAI GPT-5 Mini',
                style: 'quick, concise and direct; gets to the point fast while staying helpful' },
    openai:   { label: 'OpenAI',     symbol: '❖', aliases: ['chatgpt', 'gpt4'],   or: 'openai/gpt-4.1',               vision: true,  info: 'OpenAI GPT-4.1',
                style: 'helpful, conversational, polite and thorough, like a friendly all-round assistant' },
    gpt5plus: { label: 'GPT-5 Plus', symbol: '✪', aliases: ['gpt5', 'gptplus'],   or: 'openai/gpt-5',                 vision: true,  info: 'OpenAI GPT-5',
                style: 'deep, careful reasoning; thorough but clear, with well structured answers' },
    claude:   { label: 'Claude',     symbol: '✺', aliases: ['sonnet'],            or: 'anthropic/claude-sonnet-4.5',  vision: true,  info: 'Anthropic Claude Sonnet',
                style: 'thoughtful, nuanced, honest and warm; excellent at writing, analysis and careful explanations' },
    deepseek: { label: 'DeepSeek',   symbol: '◉', aliases: ['ds'],                or: 'deepseek/deepseek-v3.2',       vision: false, info: 'DeepSeek V3.2',
                style: 'analytical and logical; reasons step by step, especially strong at maths and code' },
    grok:     { label: 'Grok',       symbol: '✱', aliases: ['xai'],               or: 'x-ai/grok-4',                  vision: true,  info: 'xAI Grok 4',
                style: 'witty, bold and a little sarcastic; direct, with humour, but still accurate' },
    llama:    { label: 'Llama',      symbol: '✧', aliases: ['meta', 'llama3'],    or: 'meta-llama/llama-3.3-70b-instruct', vision: false, info: 'Meta Llama 3.3 70B',
                style: 'friendly, open and straightforward; casual tone, practical answers' },
    qwen:     { label: 'Qwen',       symbol: '❋', aliases: ['alibaba'],           groq: 'qwen/qwen3.8-27b', or: 'qwen/qwen3-235b-a22b-2507', vision: false, info: 'Alibaba Qwen',
                style: 'precise, structured and multilingual; strong at code and reasoning' },
    mistral:  { label: 'Mistral',    symbol: '✷', aliases: ['mistralai'],         or: 'mistralai/mistral-large-2512', vision: false, info: 'Mistral Large',
                style: 'concise, elegant and efficient; clear and direct, comfortable in many languages' },
    kimi:     { label: 'Kimi',       symbol: '❈', aliases: ['moonshot'],          or: 'moonshotai/kimi-k2.5',         vision: false, info: 'Moonshot Kimi K2.5',
                style: 'patient and detailed; good at long explanations, research summaries and step-by-step help' },
    gptoss:   { label: 'GPT-OSS',    symbol: '⬢', aliases: ['oss', 'gptoss120b'], groq: 'openai/gpt-oss-120b',        vision: false, info: 'OpenAI GPT-OSS 120B (Groq)',
                style: 'logical, clear and practical; an open-weight reasoning assistant' },
};

// Shared defaults used by the chatbot + fallbacks.
// (Groq retired Llama 3.x / Llama 4 / Qwen3-32B in 2026 — these are its current models.
//  The engine also asks Groq which models YOUR account has and adapts automatically.)
const GROQ_CHAT        = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
const GROQ_VISION      = 'qwen/qwen3.8-27b';
const GROQ_WHISPER     = ['whisper-large-v3-turbo', 'whisper-large-v3'];
const OR_VISION        = 'google/gemini-2.5-flash';
const OR_CHAT_FALLBACK = 'openai/gpt-5-mini';

module.exports = { MODELS, GROQ_CHAT, GROQ_VISION, GROQ_WHISPER, OR_VISION, OR_CHAT_FALLBACK };
