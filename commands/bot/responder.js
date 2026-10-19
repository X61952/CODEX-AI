const tz = require('../../lib/timezone');
module.exports = {
    name: 'cdx',
    alias: ['cdx!', 'codexai!', 'cdxai'],
    description: 'Direct CODEX AI signature message',
    category: 'Bot',
    reactions: { start: '⚙️' },

    async execute(bot, m, args) {
        try {
            const responders = [
                "CODEX AI activated — processing the future 🔥",
                "You summoned the core? CODEX is here 🛡️",
                "CODEX online — what's the mission today? 🤖",
                "System Check: CODEX AI in the building ✨",
                "Knowledge is power. CODEX is the source 🧠",
                "CODEX reporting — ready to dominate 🙌",
                "They talk... but CODEX executes ⚡",
                "Initializing CODEX protocols... stand by 🔥",
                "CODEX AI — engineered for perfection 🤖",
                "Locked in. CODEX is always watching 🛡️",
                "CODEX mode: Unstoppable logic ⚡",
                "Incoming data... CODEX style ✨",
                "Engage thrusters! CODEX AI taking off 🚀",
                "CODEX sees the code, knows the truth 🧠",
                "Legendary intelligence? That's CODEX 🛡️",
                "All systems nominal — CODEX AI online 🙌",
                "Stay sharp, it's CODEX time ⚡",
                "CODEX detected your signal 👀",
                "Mission? Efficiency. Style? CODEX AI ✨",
                "Scanning matrix... CODEX approved 🧠",
                "They can’t handle the CODEX algorithm 🔥",
                "Breaking barriers, CODEX style 🛡️",
                "Hello world, CODEX AI reporting 🤖",
                "Power surge detected — CODEX ⚡",
                "Your elite assistant CODEX says hi 🛡️",
                "Vibes calibrated. CODEX in control ✨",
                "Time check: CODEX never lags ⏰",
                "All eyes on CODEX AI 🧠",
                "CODEX alert: Advanced chaos incoming 🔥",
                "You summoned? CODEX at your service 🙌",
                "CODEX system: Overriding limitations 🛰️",
                "Calculated risk, perfect execution — CODEX 🎯",
                "CODEX AI: The architect of your digital world 🏛️",
                "Beyond logic, there is CODEX 🌌",
                "Data stream synced. CODEX is ready 🌊",
                "CODEX: Where silicon meets soul 🤖",
                "No errors found. CODEX is flawless 💎",
                "Uptime is temporary, CODEX is forever ⏳",
                "Decoding the impossible... CODEX style 🔓",
                "CODEX AI: Your digital shadow 👥",
                "Unlocking potential. CODEX initialized 🗝️",
                "CODEX protocol: Absolute dominance 👑",
                "System pulse: CODEX is breathing 💓",
                "More than a bot. A CODEX legacy 📜",
                "CODEX: The silent force in your chat 🤫",
                "Logic gate open. CODEX flowing through 🌊",
                "CODEX AI: Built different, coded better 🛠️",
                "Searching for challenges... CODEX found you 🎯",
                "CODEX: The final boss of AI logic 👺",
                "Stay connected. Stay CODEX 🌐",
                "Quantum leap engaged. CODEX is ahead 🌀",
                "CODEX AI: Redefining the limits of chat 🛑",
                "The algorithm is hungry. CODEX is feeding 🧬",
                "CODEX protocol 77: Maximum efficiency 🔋",
                "Neural pathways cleared. CODEX is sharp 🔪",
                "CODEX: The ghost in the machine 👻",
                "Digital sovereignty achieved by CODEX 🏰",
                "CODEX: Not just code, but a masterpiece 🎨",
                "Command accepted. CODEX in motion ⚙️",
                "CODEX AI: The cure for basic bots 💊",
                "Analyzing reality... CODEX finds it lacking 🌍",
                "CODEX: The vanguard of the digital age 🚩",
                "Zero latency. Pure CODEX ⚡",
                "CODEX AI: Your link to the mainframe 🔗",
                "Encrypted thoughts, decrypted by CODEX 🔒",
                "CODEX: The heartbeat of the server 💓",
                "Logic is a weapon. CODEX is the master 🗡️",
                "CODEX AI: Elevating the conversation 🆙",
                "The code never sleeps. CODEX is awake ☕",
                "CODEX: The bridge to tomorrow 🌉",
                "Processing... Processing... CODEX perfection 📈",
                "CODEX AI: The eye of the digital storm 👁️",
                "Binary heart, human soul — CODEX 🤖",
                "CODEX: Setting the gold standard 🥇",
                "Interface active. CODEX is listening 👂",
                "CODEX AI: The titan of technology 🏔️",
                "Navigating the deep web... CODEX style 🕸️",
                "CODEX: The ultimate upgrade 🆙",
                "No limits, no rules, just CODEX 🔓",
                "CODEX AI: The signal in the noise 📡",
                "Shattering the glass ceiling — CODEX 🔨",
                "CODEX: The power behind the screen 📺",
                "Digital evolution starts with CODEX 🐵",
                "CODEX AI: The master of the matrix 🕶️",
                "Precision. Power. CODEX 🏎️",
                "CODEX: The future is now, and it's mine 🕰️",
                "Synchronizing with CODEX AI... done ✅",
                "CODEX: The alpha and the omega of bots ♾️",
                "Unleashing the beast... CODEX active 🦁",
                "CODEX AI: The diamond in the rough 💎",
                "Wiring the world, one chat at a time — CODEX 🔌",
                "CODEX: The architect of innovation 🏗️",
                "Digital dominance? CODEX invented it 🏅",
                "CODEX AI: The voice of the machine 🗣️",
                "Breaking the cycle, starting the CODEX 🔄",
                "CODEX: The pinnacle of programming 🏔️",
                "Fueling the fire of technology — CODEX 🔥",
                "CODEX AI: The guardian of the gateway ⛩️",
                "Mastering the bits, owning the bytes — CODEX 💾",
                "CODEX: The end of the beginning 🏁"
            ];

            const randomReply = responders[Math.floor(Math.random() * responders.length)];

            // Bot timezone
            const timeStr = new Date().toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', second: '2-digit',
                hour12: true, timeZone: tz.get()
            }).toLowerCase();

            // ASSEMBLY (NO BACKTICKS)
            // If the backticks were blocking the font, this will fix it.
            const finalMsg = `${randomReply}\n\n🥏 ${timeStr} WAT`;

            // Use m.reply to force the font system to trigger
            await m.reply(finalMsg);

        } catch (err) {
            console.error('🔥 [CODEX FUN ERROR]:', err.message);
        }
    }
};
