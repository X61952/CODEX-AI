// lib/fontEngine.js
// BOT_FONT: applyFont(text, num) — bot reply styling (1-55)
// FANCY:    applyFancyFont(text, num) — .fancy styling (1-55)

// ── Helper: char map transform ────────────────────────────────────────────────
function charMap(text, map) {
    return [...text].map(c => map[c] || map[c.toUpperCase()] || c).join('');
}

// ── BOT FONT ENGINE (1-63, applied to all bot replies) ───────────────────────
const FONTS = [
    null, // 0 = off

    // 1: bold serif
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 2: italic serif
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍',l='abcdefghijklmnopqrstuvwxyz',sl='𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 3: bold italic serif
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁',l='abcdefghijklmnopqrstuvwxyz',sl='𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒉𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 4: typewriter
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉',l='abcdefghijklmnopqrstuvwxyz',sl='𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 5: sans bold
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭',l='abcdefghijklmnopqrstuvwxyz',sl='𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 6: sans italic
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡',l='abcdefghijklmnopqrstuvwxyz',sl='𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 7: sans bold italic
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕',l='abcdefghijklmnopqrstuvwxyz',sl='𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 8: cursive bold
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩',l='abcdefghijklmnopqrstuvwxyz',sl='𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 9: double-struck
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ',l='abcdefghijklmnopqrstuvwxyz',sl='𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 10: fraktur bold
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅',l='abcdefghijklmnopqrstuvwxyz',sl='𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 11: block squares 🅲🆁🆈...
    t => [...t].map(c => { const map={'A':'🅰','B':'🅱','C':'🅲','D':'🅳','E':'🅴','F':'🅵','G':'🅶','H':'🅷','I':'🅸','J':'🅹','K':'🅺','L':'🅻','M':'🅼','N':'🅽','O':'🅾','P':'🅿','Q':'🆀','R':'🆁','S':'🆂','T':'🆃','U':'🆄','V':'🆅','W':'🆆','X':'🆇','Y':'🆈','Z':'🆉'}; return map[c.toUpperCase()]||c; }).join(''),
    // 12: circled ⒶⒷⒸ...
    t => [...t].map(c => { const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='ⒶⒷⒸⒹⒺⒻⒼⒽⒾⒿⓀⓁⓂⓃⓄⓅⓆⓇⓈⓉⓊⓋⓌⓍⓎⓏ',l='abcdefghijklmnopqrstuvwxyz',sl='ⓐⓑⓒⓓⓔⓕⓖⓗⓘⓙⓚⓛⓜⓝⓞⓟⓠⓡⓢⓣⓤⓥⓦⓧⓨⓩ';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 13: vaporwave
    t => [...t].map(c => { if(c===' ')return '\u3000';const code=c.charCodeAt(0);if(code>=33&&code<=126)return String.fromCharCode(code+0xFEE0);return c;}).join(''),
    // 14: strike-through
    t => [...t].map(c => c+'\u0336').join(''),
    // 15: underline
    t => [...t].map(c => c+'\u0332').join(''),
    // 16: double underline
    t => [...t].map(c => c+'\u0333').join(''),
    // 17: tilde strike-through
    t => [...t].map(c => c+'\u0334').join(''),
    // 18: slash through
    t => [...t].map(c => c+'\u0337').join(''),
    // 19: cross above/below
    t => [...t].map(c => c+'\u035D').join(''),
    // 20: arrow below
    t => [...t].map(c => c+'\u034E').join(''),
    // 21: hearts between
    t => [...t].join('♥'),
    // 22: manga
    t => t.toUpperCase().split('').map(c => ({'A':'卂','B':'乃','C':'匚','D':'刀','E':'乇','F':'千','H':'卄','I':'工','J':'丿','L':'乚','M':'爪','N':'几','O':'ㄖ','P':'卩','R':'尺','S':'丂','T':'ㄒ','U':'ㄩ','V':'ᐯ','W':'山','X':'乂','Y':'ㄚ','Z':'乙'}[c]||c)).join(''),
    // 23: fancy1
    t => t.split('').map(c => ({'a':'ค','c':'¢','e':'ε','h':'ɦ','i':'ι','l':'ℓ','n':'ຖ','o':'໐','r':'ฯ','s':'Ş','w':'ω','y':'ყ'}[c.toLowerCase()]||c)).join(''),
    // 24: fancy2
    t => t.split('').map(c => ({'a':'ą','c':'ƈ','e':'ɛ','i':'ı','n':'ŋ','o':'ơ','r':'ཞ','s':'ʂ','v':'۷','y':'ყ'}[c.toLowerCase()]||c)).join(''),
    // 25: fancy7 ᑕᖇY...
    t => t.toUpperCase().split('').map(c=>({'A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','F':'ᖴ','H':'ᕼ','J':'ᒍ','L':'ᒪ','M':'ᗰ','N':'ᑎ','P':'ᑭ','R':'ᖇ','S':'ᔕ','U':'ᑌ','V':'ᐯ','W':'ᗯ','X':'᙭'}[c]||c)).join(''),
    // 26: fancy8 ƈʀʏ...
    t => t.split('').map(c=>({'a':'ǟ','b':'ɮ','c':'ƈ','d':'ɖ','e':'ɛ','g':'ɢ','h':'ɦ','i':'ɨ','k':'ĸ','l':'ʟ','m':'ʍ','n':'ռ','o':'օ','p':'ք','r':'ʀ','s':'ֆ','t':'ȶ','u':'ʊ','v':'ʋ','w':'ա','y':'ʏ','z':'ʐ'}[c.toLowerCase()]||c)).join(''),
    // 27: ₵ⱤɎ... fancy15
    t => t.toUpperCase().split('').map(c=>({'A':'₳','B':'₿','C':'₵','D':'Đ','E':'Ɇ','F':'₣','G':'₲','H':'Ⱨ','I':'ł','K':'₭','L':'Ⱡ','N':'₦','O':'Ø','P':'₱','R':'Ɽ','S':'₴','T':'₮','U':'Ʉ','W':'₩','X':'Ӿ','Y':'Ɏ','Z':'Ƶ'}[c]||c)).join(''),
    // 28: ÇR¥§... fancy16
    t => t.split('').map(c=>({'a':'ä','b':'ß','c':'Ç','d':'Ð','e':'ê','f':'£','i':'ï','n':'ñ','o':'Ö','p':'þ','s':'§','t':'†','u':'ü','y':'¥','C':'Ç','N':'N','O':'Ö','S':'§','Y':'¥'}[c]||c)).join(''),
    // 29: ¢яуѕ... fancy17
    t => t.toLowerCase().split('').map(c=>({'a':'а','b':'б','c':'¢','d':'д','e':'е','h':'н','i':'і','j':'ј','k':'к','l':'ℓ','m':'м','n':'η','o':'о','p':'р','r':'я','s':'ѕ','t':'т','u':'υ','v':'ν','w':'ω','x':'χ','y':'у'}[c]||c)).join(''),
    // 30: ᄃЯY... fancy18
    t => t.toUpperCase().split('').map(c=>({'A':'Λ','C':'ᄃ','N':'П','O':'Ө','R':'Я','S':'Ƨ'}[c]||c)).join(''),
    // 31: superscript ᶜᴿʸˢ...
    t => t.split('').map(c=>({'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ','R':'ᴿ','V':'ᵛ'}[c]||c)).join(''),
    // 32: subscript CᵣYₛ...
    t => t.split('').map(c=>({'a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ'}[c]||c)).join(''),
    // 33: ladybug ꏳꋪꌩ...
    t => t.toUpperCase().split('').map(c=>({'A':'ꍏ','B':'ꌃ','C':'ꏳ','D':'ꀸ','E':'ꍟ','F':'ꎇ','G':'ꁅ','H':'ꍩ','I':'ꀤ','J':'ꀭ','K':'ꀘ','L':'ꒉ','M':'ꂵ','N':'ꈤ','O':'ꂦ','P':'ꉣ','Q':'ꆰ','R':'ꋪ','S':'ꌚ','T':'ꋖ','U':'ꐇ','V':'꒦','W':'ꅐ','X':'ꉧ','Y':'ꌩ','Z':'ꁴ'}[c]||c)).join(''),
    // 34: runes ርዪሃ...
    t => t.toUpperCase().split('').map(c=>({'A':'ል','B':'ጌ','C':'ር','D':'ዕ','E':'ቿ','F':'ቻ','G':'ኗ','H':'ዘ','I':'ጎ','J':'ጋ','K':'ዀ','L':'ቸ','M':'ጠ','N':'ክ','O':'ዐ','P':'የ','R':'ዪ','S':'ነ','T':'ፕ','U':'ሁ','V':'ሀ','W':'ሠ','X':'ሸ','Y':'ሃ','Z':'ፚ'}[c]||c)).join(''),
    // 35: flip/upside-down
    t => [...t].reverse().map(c=>({'a':'ɐ','b':'q','c':'ɔ','d':'p','e':'ǝ','f':'ɟ','g':'ƃ','h':'ɥ','i':'ı','j':'ɾ','k':'ʞ','l':'ʃ','m':'ɯ','n':'u','o':'o','p':'d','q':'b','r':'ɹ','s':'s','t':'ʇ','u':'n','v':'ʌ','w':'ʍ','x':'x','y':'ʎ','z':'z','A':'∀','C':'Ɔ','D':'ᗡ','E':'Ǝ','F':'Ⅎ','H':'H','I':'I','J':'ɾ','L':'⅂','M':'W','N':'N','O':'O','P':'Ԁ','R':'ᴚ','S':'S','T':'⊥','U':'∩','V':'Λ','W':'M','X':'X','Y':'⅄','Z':'Z'}[c]||c)).join(''),
    // 36: mirror
    t => [...t].reverse().join(''),
    // 37: tiny caps
    t => t.toLowerCase().split('').map(c=>({'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','y':'ʏ','z':'ᴢ'}[c]||c)).join(''),
    // 38: fancy33
    t => t.toUpperCase().split('').map(c=>({'A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','F':'ᖴ','H':'ᕼ','J':'ᒍ','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'ᝪ','P':'ᑭ','R':'ᖇ','S':'ᔑ','U':'ᑌ','V':'ᐯ','W':'ᗯ','X':'᙭','Y':'Ꭹ'}[c]||c)).join(''),
    // 39: sparrow greek
    t => t.toUpperCase().split('').map(c=>({'A':'Δ','G':'∇','O':'Ω','P':'Π','R':'Ψ','S':'Σ','X':'Ξ'}[c]||c)).join(''),
    // 40: analucia
    t => [...t].map(c=>{const m={'a':'ꪖ','b':'ᥣ','c':'ᥴ','d':'ᦔ','e':'ꫀ','f':'ᠻ','g':'ᧁ','h':'ꫝ','i':'𝘪','j':'ꪮ','k':'ᛕ','l':'ꪶ','m':'ꪑ','n':'ꪀ','o':'ꪮ','p':'ρ','r':'𝘳','s':'𝘴','t':'𝘵','u':'ᴜ','v':'ꪜ','w':'ᭅ','x':'᥊','y':'𝘺','z':'ᴢ'};return m[c.toLowerCase()]||c;}).join(''),
    // 41: Thai fancy
    t => t.toLowerCase().split('').map(c=>({'a':'ค','b':'ც','c':'¢','d':'๔','e':'ε','f':'ƒ','g':'ɠ','h':'ɦ','i':'ι','j':'ʝ','k':'к','l':'ℓ','m':'ɱ','n':'ɳ','o':'๏','p':'ρ','q':'զ','r':'г','s':'ş','t':'ƭ','u':'ų','v':'ง','w':'ω','x':'χ','y':'ყ','z':'ʑ'}[c]||c)).join(''),
    // 42: fraktur regular
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ',l='abcdefghijklmnopqrstuvwxyz',sl='𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 43: runes2
    t => t.toUpperCase().split('').map(c=>({'A':'Ꭺ','B':'ᏴB','C':'ፈ','D':'ᗞ','E':'ᎬE','F':'ᎵF','G':'ᎶG','H':'ꮋ','I':'ᎥI','J':'ᎫJ','K':'ᏦK','L':'ᎻL','M':'ᎷM','N':'N','O':'Ꮻ','P':'ᏢP','Q':'Q','R':'Ꮢ','S':'ᏕS','T':'T','U':'Ꮜ','V':'ᐯ','W':'ᏔW','X':'ᕊ','Y':'ᎩY','Z':'Z'}[c]||c)).join(''),
    // 44: fancy31 boxed
    t => [...t].map(c=>{const m={'A':'🄰','B':'🄱','C':'🄲','D':'🄳','E':'🄴','F':'🄵','G':'🄶','H':'🄷','I':'🄸','J':'🄹','K':'🄺','L':'🄻','M':'🄼','N':'🄽','O':'🄾','P':'🄿','Q':'🅀','R':'🅁','S':'🅂','T':'🅃','U':'🅄','V':'🅅','W':'🅆','X':'🅇','Y':'🅈','Z':'🅉'};return m[c.toUpperCase()]||c;}).join(''),
    // 45: manga2
    t => t.toUpperCase().split('').map(c=>({'A':'卂','B':'乃','C':'匚','D':'ᗪ','E':'乇','H':'卄','I':'工','K':'Ҝ','L':'乚','M':'爪','N':'几','O':'ㄖ','P':'卩','R':'尺','S':'丂','T':'ㄒ','U':'ㄩ','V':'ᐯ','W':'山','X':'乂','Y':'ㄚ'}[c]||c)).join(''),
    // 46: Ҡ style
    t => t.toUpperCase().split('').map(c=>({'A':'Ⱥ','C':'Ç','D':'Ď','E':'Ɇ','G':'Ǥ','H':'Ħ','I':'Ì','J':'ĵ','K':'Ҡ','L':'Ŀ','N':'Ň','O':'Ø','P':'Ᵽ','R':'Ʀ','S':'Ş','T':'Ŧ','U':'Ʉ','V':'Ʋ','W':'Ŵ','Y':'Ɏ','Z':'Ƶ'}[c]||c)).join(''),
    // 47: wavy dots
    t => [...t].map(c => c + '\u0307').join(''),
    // 48: double overline
    t => [...t].map(c => c + '\u033F').join(''),
    // 49: dots above below
    t => [...t].map(c => c + '\u0324').join(''),
    // 50: ring above
    t => [...t].map(c => c + '\u030A').join(''),
    // 51: caron above
    t => [...t].map(c => c + '\u030C').join(''),
    // 52: tilde above
    t => [...t].map(c => c + '\u0303').join(''),
    // 53: acute accent
    t => [...t].map(c => c + '\u0301').join(''),
    // 54: grave accent
    t => [...t].map(c => c + '\u0300').join(''),
    // 55: macron above
    t => [...t].map(c => c + '\u0304').join(''),
    // 56: breve above
    t => [...t].map(c => c + '\u0306').join(''),
    // 57: diaeresis
    t => [...t].map(c => c + '\u0308').join(''),
    // 58: overline
    t => [...t].map(c => c + '\u0305').join(''),
    // 59: diamonds between
    t => [...t].join('◆'),
    // 60: stars between
    t => [...t].join('★'),
    // 61: dots between
    t => [...t].join('·'),
    // 62: arrows between
    t => [...t].join('→'),
    // 63: bars between
    t => [...t].join('|'),
    // 64: bold + underline
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'\u0332';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'\u0332';return c+'\u0332';}).join(''),
    // 65: italic + dots
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍',l='abcdefghijklmnopqrstuvwxyz',sl='𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join('·'),
    // 66: cursive + underline
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩',l='abcdefghijklmnopqrstuvwxyz',sl='𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'\u0332';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'\u0332';return c+'\u0332';}).join(''),
    // 67: double-struck + strike
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ',l='abcdefghijklmnopqrstuvwxyz',sl='𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'\u0336';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'\u0336';return c+'\u0336';}).join(''),
    // 68: typewriter + underline
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉',l='abcdefghijklmnopqrstuvwxyz',sl='𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'\u0332';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'\u0332';return c+'\u0332';}).join(''),
    // 69: wavy underline
    t => [...t].map(c => c + '\u0330').join(''),
    // 70: strikethrough + bold
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'\u0336';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'\u0336';return c+'\u0336';}).join(''),
    // 71: enclosing circle jot
    t => [...t].map(c => c + '\u20DD').join(''),
    // 72: enclosing square
    t => [...t].map(c => c + '\u20DE').join(''),
    // 73: enclosing diamond
    t => [...t].map(c => c + '\u20DF').join(''),
    // 74: enclosing keycap
    t => [...t].map(c => c + '\u20E3').join(''),
    // 75: slash + bold
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'\u0337';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'\u0337';return c+'\u0337';}).join(''),
    // 76: wave above
    t => [...t].map(c => c + '\u0311').join(''),
    // 77: zigzag above
    t => [...t].map(c => c + '\u0362').join(''),
    // 78: x above
    t => [...t].map(c => c + '\u033D').join(''),
    // 79: asterisk above
    t => [...t].map(c => c + '\u20F0').join(''),
    // 80: pipe separated bold
    t => [...t.toUpperCase()].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙';const ui=u.indexOf(c);return ui!==-1?[...s][ui]:c;}).join('|'),
    // 81: hyphen separated
    t => [...t].join('-'),
    // 82: slash separated
    t => [...t].join('/'),
    // 83: tilde between
    t => [...t].join('~'),
    // 84: plus between
    t => [...t].join('+'),
    // 85: heart between
    t => [...t].join('❤'),
    // 86: wave between
    t => [...t].join('〜'),
    // 87: circled bold
    t => [...t].map(c=>{const m={'A':'Ⓐ','B':'Ⓑ','C':'Ⓒ','D':'Ⓓ','E':'Ⓔ','F':'Ⓕ','G':'Ⓖ','H':'Ⓗ','I':'Ⓘ','J':'Ⓙ','K':'Ⓚ','L':'Ⓛ','M':'Ⓜ','N':'Ⓝ','O':'Ⓞ','P':'Ⓟ','Q':'Ⓠ','R':'Ⓡ','S':'Ⓢ','T':'Ⓣ','U':'Ⓤ','V':'Ⓥ','W':'Ⓦ','X':'Ⓧ','Y':'Ⓨ','Z':'Ⓩ','a':'ⓐ','b':'ⓑ','c':'ⓒ','d':'ⓓ','e':'ⓔ','f':'ⓕ','g':'ⓖ','h':'ⓗ','i':'ⓘ','j':'ⓙ','k':'ⓚ','l':'ⓛ','m':'ⓜ','n':'ⓝ','o':'ⓞ','p':'ⓟ','q':'ⓠ','r':'ⓡ','s':'ⓢ','t':'ⓣ','u':'ⓤ','v':'ⓥ','w':'ⓦ','x':'ⓧ','y':'ⓨ','z':'ⓩ'};return m[c]||c;}).join(''),
    // 88: square caps
    t => [...t].map(c=>{const m={'A':'🅰','B':'🅱','C':'🅲','D':'🅳','E':'🅴','F':'🅵','G':'🅶','H':'🅷','I':'🅸','J':'🅹','K':'🅺','L':'🅻','M':'🅼','N':'🅽','O':'🅾','P':'🅿','Q':'🆀','R':'🆁','S':'🆂','T':'🆃','U':'🆄','V':'🆅','W':'🆆','X':'🆇','Y':'🆈','Z':'🆉'};return m[c.toUpperCase()]||c;}).join(''),
    // 89: star dots above
    t => [...t].map(c => c + '\u0359').join(''),
    // 90: bridge above
    t => [...t].map(c => c + '\u035A').join(''),
    // 91-100: increasing zalgo intensity
    ...[25,30,35,40,45,50,55,60,65,70].map(intensity => t =>
        t.split('').map(c => {
            if (!/[a-zA-Z0-9]/.test(c)) return c;
            const COMB=['\u0300','\u0301','\u0302','\u0303','\u0304','\u0306','\u0307','\u0308','\u030A','\u030B','\u030C','\u031B','\u0332','\u0333','\u0339','\u033C','\u0362','\u0489','\u1AB0','\u1AB1'];
            const level = Math.ceil(intensity / 15);
            let result = c;
            for (let i = 0; i < level; i++) result += COMB[Math.floor(0.37 * COMB.length)];
            return result;
        }).join('')
    )
];

function applyFont(text, fontNum) {
    if (!fontNum || fontNum < 1 || fontNum > 63) return text;
    const fn = FONTS[fontNum];
    if (!fn) return text;
    return text.split('\n').map(line => {
        if (/[╔╗╚╝║═〔〕❒│]/.test(line)) return line;
        return fn(line);
    }).join('\n');
}

// ── FANCY FONT ENGINE (1-59, for .fancy command) ──────────────────────────────
// All 59 styles, applied to full input text as-is (no line filtering)
const FANCY_FONTS = [
    // 1: tiny caps
    t => t.toLowerCase().split('').map(c=>({'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','y':'ʏ','z':'ᴢ','-':'-',' ':' '}[c]||c)).join(''),
    // 2: flip
    t => [...t].reverse().map(c=>({'a':'ɐ','b':'q','c':'ɔ','d':'p','e':'ǝ','f':'ɟ','g':'ƃ','h':'ɥ','i':'ı','j':'ɾ','k':'ʞ','l':'ʃ','m':'ɯ','n':'u','o':'o','p':'d','r':'ɹ','s':'s','t':'ʇ','u':'n','v':'ʌ','w':'ʍ','x':'x','y':'ʎ','z':'z','A':'∀','C':'Ɔ','D':'ᗡ','E':'Ǝ','F':'Ⅎ','H':'H','I':'I','L':'⅂','M':'W','N':'N','O':'O','P':'Ԁ','R':'ᴚ','S':'S','T':'⊥','U':'∩','V':'Λ','W':'M','X':'X','Y':'⅄','Z':'Z','-':'-',' ':' '}[c]||c)).join(''),
    // 3: roundsquares C⃣R⃣Y⃣...
    t => [...t].map(c => c==='-'?'-':c+'\u20E3').join('\u2003'),
    // 4: squares C⃞R⃞...
    t => [...t].map(c => c==='-'?'-':c+'\u20DE').join('\u2003'),
    // 5: mirror
    t => [...t].reverse().join(''),
    // 6: creepify
    t => t.split('').map(c => {
        if(!/[a-zA-Z0-9]/.test(c)) return c;
        const CB=['\u0300','\u0301','\u0302','\u0303','\u0308','\u030C','\u0332','\u0333','\u0339','\u033C','\u1AB0','\u1AB1','\u1AB2','\u1AB3'];
        let r=c;for(let i=0;i<3;i++)r+=CB[Math.floor(0.37*CB.length)];return r;
    }).join(''),
    // 7: circled
    t => [...t].map(c=>({'A':'Ⓐ','B':'Ⓑ','C':'Ⓒ','D':'Ⓓ','E':'Ⓔ','F':'Ⓕ','G':'Ⓖ','H':'Ⓗ','I':'Ⓘ','J':'Ⓙ','K':'Ⓚ','L':'Ⓛ','M':'Ⓜ','N':'Ⓝ','O':'Ⓞ','P':'Ⓟ','Q':'Ⓠ','R':'Ⓡ','S':'Ⓢ','T':'Ⓣ','U':'Ⓤ','V':'Ⓥ','W':'Ⓦ','X':'Ⓧ','Y':'Ⓨ','Z':'Ⓩ','a':'ⓐ','b':'ⓑ','c':'ⓒ','d':'ⓓ','e':'ⓔ','f':'ⓕ','g':'ⓖ','h':'ⓗ','i':'ⓘ','j':'ⓙ','k':'ⓚ','l':'ⓛ','m':'ⓜ','n':'ⓝ','o':'ⓞ','p':'ⓟ','q':'ⓠ','r':'ⓡ','s':'ⓢ','t':'ⓣ','u':'ⓤ','v':'ⓥ','w':'ⓦ','x':'ⓧ','y':'ⓨ','z':'ⓩ'})[c]||c).join(''),
    // 8: strikeThrough
    t => [...t].map(c => c+'\u0336').join(''),
    // 9: tildeStrikeThrough
    t => [...t].map(c => c+'\u0334').join(''),
    // 10: slashThrough
    t => [...t].map(c => c+'\u0337').join(''),
    // 11: underline
    t => [...t].map(c => c+'\u0332').join(''),
    // 12: doubleUnderline
    t => [...t].map(c => c+'\u0333').join(''),
    // 13: heartsBetween
    t => [...t].join('♥'),
    // 14: arrowBelow
    t => [...t].map(c => c+'\u034E').join(''),
    // 15: crossAboveBelow
    t => [...t].map(c => c+'\u035D').join(''),
    // 16: wingdings (symbols map)
    t => [...t.toUpperCase()].map(c=>({'A':'✌︎','B':'👍︎','C':'👍︎','D':'♎︎','E':'📫︎','F':'☼︎','G':'✡︎','H':'♓︎','I':'💧︎','J':'☠︎','K':'⚐︎','L':'✞︎','M':'☯︎'}[c]||c)).join(''),
    // 17: vaporwave
    t => [...t].map(c=>{if(c===' ')return '\u3000';const code=c.charCodeAt(0);if(code>=33&&code<=126)return String.fromCharCode(code+0xFEE0);return c;}).join(''),
    // 18: sparrow greek
    t => t.toUpperCase().split('').map(c=>({'A':'Δ','G':'∇','O':'Ω','P':'Π','R':'Ψ','S':'Σ','X':'Ξ'}[c]||c)).join(''),
    // 19: manga
    t => t.toUpperCase().split('').map(c=>({'A':'卂','B':'乃','C':'匚','D':'刀','E':'乇','F':'千','H':'卄','I':'工','L':'乚','M':'爪','N':'几','O':'ㄖ','P':'卩','R':'尺','S':'丂','T':'ㄒ','U':'ㄩ','V':'ᐯ','W':'山','X':'乂','Y':'ㄚ','Z':'乙'}[c]||c)).join(''),
    // 20: ladybug
    t => t.toUpperCase().split('').map(c=>({'A':'ꍏ','B':'ꌃ','C':'ꏳ','D':'ꀸ','E':'ꍟ','F':'ꎇ','G':'ꁅ','H':'ꍩ','I':'ꀤ','J':'ꀭ','K':'ꀘ','L':'ꒉ','M':'ꂵ','N':'ꈤ','O':'ꂦ','P':'ꉣ','Q':'ꆰ','R':'ꋪ','S':'ꌚ','T':'ꋖ','U':'ꐇ','V':'꒦','W':'ꅐ','X':'ꉧ','Y':'ꌩ','Z':'ꁴ'}[c]||c)).join(''),
    // 21: runes
    t => t.toUpperCase().split('').map(c=>({'A':'ል','B':'ጌ','C':'ር','D':'ዕ','E':'ቿ','F':'ቻ','G':'ኗ','H':'ዘ','I':'ጎ','J':'ጋ','K':'ዀ','L':'ቸ','M':'ጠ','N':'ክ','O':'ዐ','P':'የ','R':'ዪ','S':'ነ','T':'ፕ','U':'ሁ','V':'ሀ','W':'ሠ','X':'ሸ','Y':'ሃ','Z':'ፚ'}[c]||c)).join(''),
    // 22: bold serif
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 23: bold italic serif
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁',l='abcdefghijklmnopqrstuvwxyz',sl='𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒉𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 24: italic serif
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍',l='abcdefghijklmnopqrstuvwxyz',sl='𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 25: analucia
    t => [...t].map(c=>{const m={'a':'ꪖ','b':'ᥣ','c':'ᥴ','d':'ᦔ','e':'ꫀ','f':'ᠻ','g':'ᧁ','h':'ꫝ','i':'𝘪','j':'ꪮ','k':'ᛕ','l':'ꪶ','m':'ꪑ','n':'ꪀ','o':'ꪮ','p':'ρ','r':'𝘳','s':'𝘴','t':'𝘵','u':'ᴜ','v':'ꪜ','w':'ᭅ','x':'᥊','y':'𝘺','z':'ᴢ'};return m[c.toLowerCase()]||c;}).join(''),
    // 26: typewriter
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉',l='abcdefghijklmnopqrstuvwxyz',sl='𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 27: fancy1
    t => t.split('').map(c=>({'a':'ค','c':'¢','e':'ε','h':'ɦ','i':'ι','l':'ℓ','n':'ຖ','o':'໐','r':'ฯ','s':'Ş','w':'ω','y':'ყ'}[c.toLowerCase()]||c)).join(''),
    // 28: fancy2
    t => t.split('').map(c=>({'a':'ą','c':'ƈ','e':'ɛ','i':'ı','n':'ŋ','o':'ơ','r':'ཞ','s':'ʂ','v':'۷','y':'ყ'}[c.toLowerCase()]||c)).join(''),
    // 29: fancy3 ᄃ尺ﾘ...
    t => t.toUpperCase().split('').map(c=>({'A':'ﾑ','C':'ᄃ','D':'刀','I':'ﾉ','K':'𝕶','N':'刀','O':'の','R':'尺','S':'丂','U':'ㄩ','V':'√','Y':'ﾘ'}[c]||c)).join(''),
    // 30: manga2 Ҝㄖ尺ᗪ
    t => t.toUpperCase().split('').map(c=>({'A':'卂','B':'乃','C':'匚','D':'ᗪ','E':'乇','H':'卄','I':'工','K':'Ҝ','L':'乚','M':'爪','N':'几','O':'ㄖ','P':'卩','R':'尺','S':'丂','T':'ㄒ','U':'ㄩ','V':'ᐯ','W':'山','X':'乂','Y':'ㄚ'}[c]||c)).join(''),
    // 31: fancy5 🄺🄾🅁...
    t => [...t].map(c=>{const m={'A':'🄰','B':'🄱','C':'🄲','D':'🄳','E':'🄴','F':'🄵','G':'🄶','H':'🄷','I':'🄸','J':'🄹','K':'🄺','L':'🄻','M':'🄼','N':'🄽','O':'🄾','P':'🄿','Q':'🅀','R':'🅁','S':'🅂','T':'🅃','U':'🅄','V':'🅅','W':'🅆','X':'🅇','Y':'🅈','Z':'🅉'};return m[c.toUpperCase()]||c;}).join(''),
    // 32: runes2 ፈᏒᎩ...
    t => t.toUpperCase().split('').map(c=>({'A':'Ꭺ','B':'ᏴB','C':'ፈ','D':'ᗞ','E':'ᎬE','F':'ᎵF','G':'ᎶG','H':'ꮋ','I':'ᎥI','J':'ᎫJ','K':'ᏦK','L':'ᎻL','M':'ᎷM','N':'N','O':'Ꮻ','P':'ᏢP','Q':'Q','R':'Ꮢ','S':'ᏕS','T':'T','U':'Ꮜ','V':'ᐯ','W':'ᏔW','X':'ᕊ','Y':'ᎩY','Z':'Z'}[c]||c)).join(''),
    // 33: fancy7 Kᝪᖇᗞ
    t => t.toUpperCase().split('').map(c=>({'A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','F':'ᖴ','H':'ᕼ','I':'I','J':'ᒍ','K':'K','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'O','P':'ᑭ','Q':'Q','R':'ᖇ','S':'ᔕ','U':'ᑌ','V':'ᐯ','W':'ᗯ','X':'᙭','Y':'Y'}[c]||c)).join(''),
    // 34: fancy8
    t => t.split('').map(c=>({'a':'ǟ','b':'ɮ','c':'ƈ','d':'ɖ','e':'ɛ','g':'ɢ','h':'ɦ','i':'ɨ','k':'ĸ','l':'ʟ','m':'ʍ','n':'ռ','o':'օ','p':'ք','r':'ʀ','s':'ֆ','t':'ȶ','u':'ʊ','v':'ʋ','w':'ա','y':'ʏ','z':'ʐ'}[c.toLowerCase()]||c)).join(''),
    // 35: typewriter2
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉',l='abcdefghijklmnopqrstuvwxyz',sl='𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 36: sans bold italic
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕',l='abcdefghijklmnopqrstuvwxyz',sl='𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 37: sans bold
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭',l='abcdefghijklmnopqrstuvwxyz',sl='𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 38: bold serif2
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣���𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 39: sans italic
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡',l='abcdefghijklmnopqrstuvwxyz',sl='𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 40: fancy17
    t => t.toLowerCase().split('').map(c=>({'a':'а','b':'б','c':'¢','d':'д','e':'е','h':'н','i':'і','j':'ј','k':'к','l':'ℓ','m':'м','n':'η','o':'о','p':'р','r':'я','s':'ѕ','t':'т','u':'υ','v':'ν','w':'ω','x':'χ','y':'у'}[c]||c)).join(''),
    // 41: ₵ⱤɎ...
    t => t.toUpperCase().split('').map(c=>({'A':'₳','B':'₿','C':'₵','D':'Đ','E':'Ɇ','F':'₣','G':'₲','H':'Ⱨ','I':'ł','K':'₭','L':'Ⱡ','N':'₦','O':'Ø','P':'₱','R':'Ɽ','S':'₴','T':'₮','U':'Ʉ','W':'₩','X':'Ӿ','Y':'Ɏ','Z':'Ƶ'}[c]||c)).join(''),
    // 42: ÇR¥§...
    t => t.split('').map(c=>({'a':'ä','b':'ß','c':'Ç','d':'Ð','e':'ê','f':'£','i':'ï','n':'ñ','o':'Ö','s':'§','t':'†','u':'ü','y':'¥','C':'Ç','O':'Ö','S':'§','Y':'¥'}[c]||c)).join(''),
    // 43: ¢яуѕ...
    t => t.toLowerCase().split('').map(c=>({'a':'а','b':'б','c':'¢','d':'д','e':'е','h':'н','i':'і','k':'к','l':'ℓ','m':'м','n':'η','o':'о','p':'р','r':'я','s':'ѕ','t':'т','u':'υ','v':'ν','w':'ω','x':'χ','y':'у'}[c]||c)).join(''),
    // 44: KӨЯD
    t => t.toUpperCase().split('').map(c=>({'A':'Λ','C':'ᄃ','N':'П','O':'Ө','R':'Я','S':'Ƨ'}[c]||c)).join(''),
    // 45: Ҡ...
    t => t.toUpperCase().split('').map(c=>({'A':'Ⱥ','C':'Ç','D':'Ď','E':'Ɇ','G':'Ǥ','H':'Ħ','I':'Ì','J':'ĵ','K':'Ҡ','L':'Ŀ','M':'M','N':'Ň','O':'Ø','P':'Ᵽ','Q':'Q','R':'Ʀ','S':'Ş','T':'Ŧ','U':'Ʉ','V':'Ʋ','W':'Ŵ','X':'X','Y':'Ɏ','Z':'Ƶ'}[c]||c)).join(''),
    // 46: subscript
    t => t.split('').map(c=>({'a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ'}[c]||c)).join(''),
    // 47: superscript
    t => t.split('').map(c=>({'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ','i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ','y':'ʸ','z':'ᶻ','R':'ᴿ'}[c]||c)).join(''),
    // 48: к๏г๔ Thai
    t => t.toLowerCase().split('').map(c=>({'a':'ค','b':'ც','c':'¢','d':'๔','e':'ε','f':'ƒ','g':'ɠ','h':'ɦ','i':'ι','j':'ʝ','k':'к','l':'ℓ','m':'ɱ','n':'ɳ','o':'๏','p':'ρ','q':'զ','r':'г','s':'ş','t':'ƭ','u':'ų','v':'ง','w':'ω','x':'χ','y':'ყ','z':'ʑ'}[c]||c)).join(''),
    // 49: double-struck
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ',l='abcdefghijklmnopqrstuvwxyz',sl='𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 50: fraktur bold
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅',l='abcdefghijklmnopqrstuvwxyz',sl='𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 51: block squares
    t => [...t].map(c=>{const m={'A':'🅰','B':'🅱','C':'🅲','D':'🅳','E':'🅴','F':'🅵','G':'🅶','H':'🅷','I':'🅸','J':'🅹','K':'🅺','L':'🅻','M':'🅼','N':'🅽','O':'🅾','P':'🅿','Q':'🆀','R':'🆁','S':'🆂','T':'🆃','U':'🆄','V':'🆅','W':'🆆','X':'🆇','Y':'🆈','Z':'🆉'};return m[c.toUpperCase()]||c;}).join(''),
    // 52: cursive bold
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩',l='abcdefghijklmnopqrstuvwxyz',sl='𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 53: fraktur regular
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ',l='abcdefghijklmnopqrstuvwxyz',sl='𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 54: fullwidth Ａ...
    t => [...t].map(c=>{if(c===' ')return '\u3000';const code=c.charCodeAt(0);if(code>=33&&code<=126)return String.fromCharCode(code+0xFEE0);return c;}).join(''),
    // 55: bold italic serif2
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁',l='abcdefghijklmnopqrstuvwxyz',sl='𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒉𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 56: greek math
    t => t.toUpperCase().split('').map(c=>({'A':'𝛥','B':'B','C':'C','D':'D','E':'E','F':'F','G':'G','H':'H','I':'𝛪','J':'J','K':'𝛫','L':'L','M':'M','N':'𝛮','O':'𝛩','P':'𝛱','Q':'Q','R':'𝛲','S':'S','T':'T','U':'U','V':'V','W':'W','X':'Ξ','Y':'Y','Z':'Z'}[c]||c)).join(''),
    // 57: greek bold
    t => t.toUpperCase().split('').map(c=>({'A':'𝞓','B':'B','C':'C','D':'𝘿','E':'E','F':'F','G':'G','H':'H','I':'𝞘','J':'J','K':'K','L':'L','M':'M','N':'N','O':'𝞗','P':'P','Q':'Q','R':'𝞒','S':'S','T':'T','U':'U','V':'V','W':'W','X':'X','Y':'Y','Z':'Z'}[c]||c)).join(''),
    // 58: greek mixed
    t => t.toUpperCase().split('').map(c=>({'A':'𝚫','B':'B','C':'C','D':'𝐃','E':'E','F':'F','G':'G','H':'H','I':'𝚰','J':'J','K':'𝐊','L':'L','M':'M','N':'N','O':'𝚯','P':'P','Q':'Q','R':'𝚪','S':'S','T':'T','U':'U','V':'V','W':'W','X':'X','Y':'Y','Z':'Z'}[c]||c)).join(''),
    // 59: fancy33 variant
    t => t.toUpperCase().split('').map(c=>({'A':'ᗩ','B':'ᗷ','C':'ᑕ','D':'ᗪ','E':'E','F':'ᖴ','G':'G','H':'ᕼ','I':'I','J':'ᒍ','K':'K','L':'ᒪ','M':'ᗰ','N':'ᑎ','O':'ᝪ','P':'ᑭ','Q':'Q','R':'ᖇ','S':'ᔑ','T':'T','U':'ᑌ','V':'ᐯ','W':'ᗯ','X':'᙭','Y':'Ꭹ','Z':'Z'}[c]||c)).join(''),

    // 60: block inverse 🅒🅞🅓🅔🅩
    t => [...t].map(c=>{const m={'A':'🅐','B':'🅑','C':'🅒','D':'🅓','E':'🅔','F':'🅕','G':'🅖','H':'🅗','I':'🅘','J':'🅙','K':'🅚','L':'🅛','M':'🅜','N':'🅝','O':'🅞','P':'🅟','Q':'🅠','R':'🅡','S':'🅢','T':'🅣','U':'🅤','V':'🅥','W':'🅦','X':'🅧','Y':'🅨','Z':'🅩'};return m[c.toUpperCase()]||c;}).join(''),
    // 61: manga CJK 匚ㄖ
    t => t.toUpperCase().split('').map(c=>({'A':'卂','B':'乃','C':'匚','D':'ᗪ','E':'乇','F':'千','H':'卄','I':'工','K':'Ҝ','L':'乚','M':'爪','N':'几','O':'ㄖ','P':'卩','R':'尺','S':'丂','T':'ㄒ','U':'ㄩ','V':'ᐯ','W':'山','X':'乂','Y':'ㄚ','Z':'乙'}[c]||c)).join(''),
    // 62: fraktur bold 𝕮𝕺𝕯𝕰𝖃
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅',l='abcdefghijklmnopqrstuvwxyz',sl='𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 63: double-struck ℂ𝕆𝔻𝔼𝕏
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ',l='abcdefghijklmnopqrstuvwxyz',sl='𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 64: tiny caps ᴄᴏᴅᴇx
    t => t.toLowerCase().split('').map(c=>({'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','y':'ʏ','z':'ᴢ'}[c]||c)).join(''),
    // 65: ₵ØĐɆӾ currency
    t => t.toUpperCase().split('').map(c=>({'A':'Ⱥ','B':'฿','C':'₵','D':'Đ','E':'Ɇ','F':'₣','G':'₲','H':'Ⱨ','I':'Ɨ','K':'₭','L':'£','M':'₥','N':'₦','O':'Ø','P':'₱','R':'Ɽ','S':'₴','T':'₮','U':'Ʉ','W':'₩','X':'Ӿ','Y':'Ɏ','Z':'Ƶ'}[c]||c)).join(''),
    // 66: fullwidth ＣＯＤＥＸ
    t => [...t].map(c=>{if(c===' ')return '　';const code=c.charCodeAt(0);if(code>=33&&code<=126)return String.fromCharCode(code+0xFEE0);return c;}).join(''),
    // 67: cursive bold 𝓒𝓞𝓓𝓔𝓧
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩',l='abcdefghijklmnopqrstuvwxyz',sl='𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 68: bold italic serif 𝑩𝑶𝑫𝑬𝑿
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁',l='abcdefghijklmnopqrstuvwxyz',sl='𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒉𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 69: sans bold italic 𝘾𝙊𝘿𝙀𝙓
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕',l='abcdefghijklmnopqrstuvwxyz',sl='𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 70: sans italic 𝘊𝘖𝘋𝘌𝘟
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡',l='abcdefghijklmnopqrstuvwxyz',sl='𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 71: runes ርዪሃ
    t => t.toUpperCase().split('').map(c=>({'A':'ል','B':'ጌ','C':'ር','D':'ዕ','E':'ቿ','F':'ቻ','G':'ኗ','H':'ዘ','I':'ጎ','J':'ጋ','K':'ዀ','L':'ቸ','M':'ጠ','N':'ክ','O':'ዐ','P':'የ','R':'ዪ','S':'ነ','T':'ፕ','U':'ሁ','V':'ሀ','W':'ሠ','X':'ሸ','Y':'ሃ','Z':'ፚ'}[c]||c)).join(''),
    // 72: sans bold 𝗖𝗢𝗗𝗘𝗫
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭',l='abcdefghijklmnopqrstuvwxyz',sl='𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 73: Thai к๏г๔
    t => t.toLowerCase().split('').map(c=>({'a':'ค','b':'ც','c':'¢','d':'๔','e':'ε','f':'ƒ','g':'ɠ','h':'ɦ','i':'ι','j':'ʝ','k':'к','l':'ℓ','m':'ɱ','n':'ɳ','o':'๏','p':'ρ','r':'г','s':'ş','t':'ƭ','u':'ų','v':'ง','w':'ω','x':'χ','y':'ყ','z':'ʑ'}[c]||c)).join(''),
    // 74: Cσԃҽx style
    t => t.split('').map(c=>({'a':'α','b':'в','c':'¢','d':'∂','e':'є','f':'ƒ','g':'ɠ','h':'н','i':'ι','j':'נ','k':'к','l':'ℓ','m':'м','n':'η','o':'σ','p':'ρ','r':'я','s':'ѕ','t':'т','u':'υ','v':'ν','w':'ω','x':'χ','y':'ψ','z':'ζ'}[c.toLowerCase()]||c)).join(''),
    // 75: ₳₦₲Ɇ₮ alternate currency
    t => t.toUpperCase().split('').map(c=>({'A':'₳','B':'฿','C':'©','D':'Đ','E':'€','F':'₣','G':'₲','H':'♄','I':'¡','K':'₭','L':'£','M':'₥','N':'₦','O':'Ø','P':'₱','R':'₨','S':'$','T':'₮','U':'μ','W':'₩','X':'✗','Y':'¥','Z':'ℤ'}[c]||c)).join(''),
    // 76: bold + double underline
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'̳';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'̳';return c+'̳';}).join(''),
    // 77: hearts between ♥
    t => '♥' + [...t].join('♥') + '♥',
    // 78: stars between ★
    t => '★' + [...t].join('★') + '★',
    // 79: arrows between →
    t => [...t].join('→'),
    // 80: diamonds between ◆
    t => [...t].join('◆'),
    // 81: fraktur regular 𝔎𝔬𝔯𝔡
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ',l='abcdefghijklmnopqrstuvwxyz',sl='𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join(''),
    // 82: bold + overline
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'̅';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'̅';return c+'̅';}).join(''),
    // 83: cursive + underline
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩',l='abcdefghijklmnopqrstuvwxyz',sl='𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'̲';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'̲';return c+'̲';}).join(''),
    // 84: typewriter + underline
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉',l='abcdefghijklmnopqrstuvwxyz',sl='𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'̲';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'̲';return c+'̲';}).join(''),
    // 85: double-struck + strike
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏���ℤ',l='abcdefghijklmnopqrstuvwxyz',sl='𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'̶';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'̶';return c+'̶';}).join(''),
    // 86: analucia
    t => [...t].map(c=>{const m={'a':'ꪖ','b':'ᥣ','c':'ᥴ','d':'ᦔ','e':'ꫀ','f':'ᠻ','g':'ᧁ','h':'ꫝ','i':'𝘪','j':'ꪮ','k':'ᛕ','l':'ꪶ','m':'ꪑ','n':'ꪀ','o':'ꪮ','p':'ρ','r':'𝘳','s':'𝘴','t':'𝘵','u':'ᴜ','v':'ꪜ','w':'ᭅ','x':'᥊','y':'𝘺','z':'ᴢ'};return m[c.toLowerCase()]||c;}).join(''),
    // 87: manga spaced 卂 丨
    t => t.toUpperCase().split('').map(c=>({'A':'卂','B':'乃','C':'匚','D':'刀','E':'乇','F':'千','H':'卄','I':'工','L':'乚','M':'爪','N':'几','O':'ㄖ','P':'卩','R':'尺','S':'丂','T':'ㄒ','U':'ㄩ','V':'ᐯ','W':'山','X':'乂','Y':'ㄚ','Z':'乙'}[c]||c)).join(' '),
    // 88: vaporwave spaced
    t => [...t].map(c=>{if(c===' ')return '　';const code=c.charCodeAt(0);if(code>=33&&code<=126)return String.fromCharCode(code+0xFEE0);return c;}).join(' '),
    // 89: alternate bold/italic per char
    t => [...t].map((c,i)=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',sb='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',lb='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳',si='𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍',li2='𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧';const ui=u.indexOf(c);const li3='abcdefghijklmnopqrstuvwxyz'.indexOf(c);if(i%2===0){if(ui!==-1)return[...sb][ui];if(li3!==-1)return[...lb][li3];}else{if(ui!==-1)return[...si][ui];if(li3!==-1)return[...li2][li3];}return c;}).join(''),
    // 90: circled spaced Ⓒ Ⓞ Ⓓ
    t => [...t].map(c=>({'A':'Ⓐ','B':'Ⓑ','C':'Ⓒ','D':'Ⓓ','E':'Ⓔ','F':'Ⓕ','G':'Ⓖ','H':'Ⓗ','I':'Ⓘ','J':'Ⓙ','K':'Ⓚ','L':'Ⓛ','M':'Ⓜ','N':'Ⓝ','O':'Ⓞ','P':'Ⓟ','Q':'Ⓠ','R':'Ⓡ','S':'Ⓢ','T':'Ⓣ','U':'Ⓤ','V':'Ⓥ','W':'Ⓦ','X':'Ⓧ','Y':'Ⓨ','Z':'Ⓩ','a':'ⓐ','b':'ⓑ','c':'ⓒ','d':'ⓓ','e':'ⓔ','f':'ⓕ','g':'ⓖ','h':'ⓗ','i':'ⓘ','j':'ⓙ','k':'ⓚ','l':'ⓛ','m':'ⓜ','n':'ⓝ','o':'ⓞ','p':'ⓟ','q':'ⓠ','r':'ⓡ','s':'ⓢ','t':'ⓣ','u':'ⓤ','v':'ⓥ','w':'ⓦ','x':'ⓧ','y':'ⓨ','z':'ⓩ'})[c]||c).join(' '),
    // 91: bold + wavy underline
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'̰';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'̰';return c+'̰';}).join(''),
    // 92: zalgo medium
    t => t.split('').map(c=>{if(!/[a-zA-Z0-9]/.test(c))return c;const C=['̀','́','̂','̃','̈','̌','̲','᪰'];let r=c;for(let i=0;i<3;i++)r+=C[Math.floor(0.37*C.length)];return r;}).join(''),
    // 93: 🄒🄾🄳🄴🅇 boxed outline
    t => [...t].map(c=>{const m={'A':'🄰','B':'🄱','C':'🄲','D':'🄳','E':'🄴','F':'🄵','G':'🄶','H':'🄷','I':'🄸','J':'🄹','K':'🄺','L':'🄻','M':'🄼','N':'🄽','O':'🄾','P':'🄿','Q':'🅀','R':'🅁','S':'🅂','T':'🅃','U':'🅄','V':'🅅','W':'🅆','X':'🅇','Y':'🅈','Z':'🅉'};return m[c.toUpperCase()]||c;}).join(''),
    // 94: italic + dots between
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍',l='abcdefghijklmnopqrstuvwxyz',sl='𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui];const li=l.indexOf(c);if(li!==-1)return[...sl][li];return c;}).join('·'),
    // 95: Ҡ style bold
    t => t.toUpperCase().split('').map(c=>({'A':'Ⱥ','C':'Ç','D':'Ď','E':'Ɇ','G':'Ǥ','H':'Ħ','I':'Ì','J':'ĵ','K':'Ҡ','L':'Ŀ','N':'Ň','O':'Ø','P':'Ᵽ','R':'Ʀ','S':'Ş','T':'Ŧ','U':'Ʉ','V':'Ʋ','W':'Ŵ','Y':'Ɏ','Z':'Ƶ'}[c]||c)).join(''),
    // 96: runes2 Ꭺ Ꮢ
    t => t.toUpperCase().split('').map(c=>({'A':'Ꭺ','B':'B','C':'ፈ','D':'ᗞ','E':'E','H':'ꮋ','I':'I','J':'ᎫJ','K':'K','L':'L','M':'M','O':'Ꮻ','R':'Ꮢ','S':'S','T':'T','U':'Ꮜ','V':'ᐯ','W':'W','X':'ᕊ','Y':'Y'}[c]||c)).join(''),
    // 97: bold + diaeresis
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙',l='abcdefghijklmnopqrstuvwxyz',sl='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'̈';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'̈';return c+'̈';}).join(''),
    // 98: cursive + tilde
    t => [...t].map(c=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ',s='𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩',l='abcdefghijklmnopqrstuvwxyz',sl='𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃';const ui=u.indexOf(c);if(ui!==-1)return[...s][ui]+'̃';const li=l.indexOf(c);if(li!==-1)return[...sl][li]+'̃';return c+'̃';}).join(''),
    // 99: zalgo heavy
    t => t.split('').map(c=>{if(!/[a-zA-Z0-9]/.test(c))return c;const C=['̀','́','̂','̃','̈','̌','̲','̳','᪰','᪱'];let r=c;for(let i=0;i<5;i++)r+=C[Math.floor(0.37*C.length)];return r;}).join(''),
    // 100: mixed cursive+bold alternating
    t => t.split(' ').map((w,i)=>{const u='ABCDEFGHIJKLMNOPQRSTUVWXYZ';const sc='𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩';const lc='𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃';const sb='𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙';const lb='𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳';return[...w].map(c=>{const ui=u.indexOf(c);const li='abcdefghijklmnopqrstuvwxyz'.indexOf(c);if(i%2===0){if(ui!==-1)return[...sc][ui];if(li!==-1)return[...lc][li];}else{if(ui!==-1)return[...sb][ui];if(li!==-1)return[...lb][li];}return c;}).join('');}).join(' '),

];

// Remove repeated styles from the original numbered list, keeping their first entries.
const DUPLICATE_FONT_INDICES = new Set([35, 38, 54, 55]);
const FONT_NAMES = Object.freeze([
    'tiny caps', 'upside down', 'keycap', 'squared', 'mirror', 'creepify',
    'circled', 'strike through', 'tilde strike through', 'slash through',
    'underline', 'double underline', 'hearts between', 'arrow below',
    'cross above and below', 'wingdings', 'fullwidth', 'Greek symbols',
    'manga', 'ladybug', 'runes', 'bold serif', 'bold italic serif',
    'italic serif', 'Analucia', 'typewriter', 'fancy symbols 1',
    'fancy symbols 2', 'Japanese mix', 'manga 2', 'outlined boxes',
    'runes 2', 'angular capitals', 'fancy lowercase', 'sans bold italic',
    'sans bold', 'sans italic', 'fancy 17', '₵ⱤɎ style', 'ÇR¥§ style',
    '¢яуѕ style', 'KӨЯD', 'Ҡ style', 'subscript', 'superscript',
    'Thai script', 'double-struck', 'bold fraktur', 'block capitals',
    'cursive bold', 'fraktur', 'Greek math', 'Greek bold', 'Greek mixed',
    'angular alphabet',
]);
const FONT_REGISTRY = Object.freeze(
    FANCY_FONTS.slice(0, 59).filter((_, index) => !DUPLICATE_FONT_INDICES.has(index + 1))
);
const FONT_COUNT = FONT_REGISTRY.length;
const FANCY_FONT_COUNT = FONT_REGISTRY.length;

function transform(text, fontNum) {
    if (!fontNum || fontNum < 1 || fontNum > FONT_REGISTRY.length) return text;
    try { return FONT_REGISTRY[fontNum - 1](text); }
    catch { return text; }
}

function applyFont(text, fontNum) {
    return text.split('\n').map(line => /[╔╗╚╝║═〔〕❒│]/.test(line) ? line : transform(line, fontNum)).join('\n');
}

function applyFancyFont(text, fontNum) {
    return transform(text, fontNum);
}

module.exports = { applyFont, applyFancyFont, FONT_COUNT, FANCY_FONT_COUNT, FONT_NAMES };
