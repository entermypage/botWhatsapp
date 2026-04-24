const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs-extra');
const readline = require('readline');

// ==========================================
//   🦏 SATPAM LOG - ANTI SAMPAH BUFFER 🦏
// ==========================================
const originalWrite = process.stdout.write;
process.stdout.write = function(chunk) {
    const logs = chunk.toString();
    if (
        logs.includes('Buffer') || logs.includes('Key') || 
        logs.includes('chains') || logs.includes('SessionEntry') ||
        logs.includes('registrationId') || logs.includes('ephemeralKeyPair')
    ) {
        return;
    }
    return originalWrite.apply(process.stdout, arguments);
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const isLateNight = () => {
    const hour = new Date().getHours();
    return (hour >= 23 || hour <= 5); 
};

const getRandomCall = () => {
    const calls = ["om", "kak", "bang", "bestie", "mas", "boss"];

    // kadang ga pake sapaan biar natural (40% kosong)
    if (Math.random() < 0.4) return "";

    // pilih random
    let call = calls[Math.floor(Math.random() * calls.length)];

    // random typo dikit biar kayak manusia (opsional)
    if (Math.random() < 0.2) {
        call = call.replace("a", "aa"); // contoh: kak → kaak
    }

    return call;
};

const getChatWord = () => {
    try {
        const data = fs.readJsonSync('./kata.json');
        let word = data.list[Math.floor(Math.random() * data.list.length)];
        return `${word} ${getRandomCall()}`;
    } catch (e) { return `iya ${getRandomCall()}`; }
};
if (!global.lastPC) global.lastPC = {};

function getSavedSessions() {
    const base = './sessions';

    if (!fs.existsSync(base)) return [];

    return fs.readdirSync(base)
        .filter(f => f.startsWith('session_'))
        .map(f => f.replace('session_', ''));
}

async function startBot(phoneNumber) {
    const sessionPath = `./sessions/session_${phoneNumber}`;
    const USERS_FILE = `./users_${phoneNumber}.json`;
    function loadUsers() {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE));
            return new Set(data);
        }
        return new Set();
    }
    
    function saveUsers(users) {
        fs.writeFileSync(USERS_FILE, JSON.stringify([...users]));
    }
    const getRecentUsers = () => {
        return Array.from(recentUsers);
    };
    let recentUsers = loadUsers();
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })),
        },
        logger: pino({ level: 'fatal' }),
        printQRInTerminal: false,
        syncFullHistory: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!sock.authState.creds.registered) {
        console.log(`\x1b[33m\n[!] Menghubungkan: ${phoneNumber}...\x1b[0m`);
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                process.stdout.write('\x1Bc'); 
                console.log(`\x1b[36m
      🦏 BADAK KEUNNN BY KENNY 🦏
        +-------------------------------+
        |  KODE PAIRING : \x1b[31m${code}\x1b[36m  |
        +-------------------------------+
\x1b[0m`);
            } catch (err) { }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const pushName = msg.pushName || 'User';
        const participant = msg.key.participant || sender;
        const textMessage = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        
        const time = new Date().toLocaleTimeString();
        console.log(`\n\x1b[90m------------------------------------------\x1b[0m`);
        console.log(`\x1b[37m[${time}]\x1b[0m \x1b[32m${pushName}\x1b[0m -> \x1b[33m${isGroup ? 'Grup' : 'Privat'}\x1b[0m`);
        console.log(`\x1b[37mMsg:\x1b[0m ${textMessage}`);
        
        // --- 1. AUTO REPLY GRUP (ANTI SPAM VERSION) ---
        const groupTriggers = ["farming", "chat", "save", "sv", "sve", "cht"];
        
        if (isGroup && groupTriggers.some(t => textMessage.includes(t))) {
        
            // anti spam per grup (cooldown 2 menit)
            const now = Date.now();
            if (!global.groupCooldown) global.groupCooldown = {};
            
            if (global.groupCooldown[sender] && now - global.groupCooldown[sender] < 4500) return;
            global.groupCooldown[sender] = now;
            const call = getRandomCall();
            const replies = [
                `chat duluan ${call} lagi kena batas, langsung ku save kok`.trim(),
                `lagi limit ${call}, chat aja dulu nanti ku save`.trim(),
                `gas chat dulu ${call}, nanti langsung ku save ya`.trim(),
                `chat dulu aja ${call}, lagi kena limit 😅`.trim(),
                `coba chat dulu ${call}, lagi dibatesin soalnya`.trim(),
                `chat aja dulu ${call}, nanti aku save kok santai`.trim(),
                `lagi kena limit ${call} 😅 chat dulu aja ya`.trim()
            ];
        
            const reply = replies[Math.floor(Math.random() * replies.length)];
        
            setTimeout(async () => {
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                console.log(`\x1b[35m[GRUP REPLY]\x1b[0m 🦏 Respon trigger`);
            }, Math.floor(Math.random() * 5000) + 3000); // delay 3-8 detik
        }

        // --- 2. AUTO SAVE + AUTO REPLY (USER BARU) ---
        const saveTriggers = ["halo", "save", "sve", "farming", "p", "bang", "bg"];
        const words = textMessage.split(/\s+/);
        
        if (!savedContacts.has(number)) {
            savedContacts.add(number);
        }
        
        const number = participant.split('@')[0];
        
        // kalau belum pernah disave + kena trigger
        if (saveTriggers.some(t => words.includes(t)) && !global.savedContacts.has(number)) {
        
            global.savedContacts.add(number);
        
            // delay biar natural
            setTimeout(async () => {
                const call = getRandomCall();
        
                // save ke VCF
                const vcf = `BEGIN:VCARD
        VERSION:3.0
        FN:${pushName}
        TEL;TYPE=CELL:${number}
        END:VCARD
        `;
                fs.appendFileSync('./database_kontak.vcf', vcf);
        
                console.log(`\x1b[36m[SAVE]\x1b[0m 🦏 ${pushName} (${number})`);
        
                // hanya balas kalau private chat (biar gak spam grup)
                if (!isGroup) {
                    const replies = [
                        `tolong save ${call} nomor mu udah aku save`.trim(),
                        `nomormu udah aku save ${call} tolong di save back🙏`.trim(),
                        `nomor kamu udah aku save ${call}`.trim(),
                        `save ya ${call}, makasih udah chat`.trim()
                    ];
        
                    const reply = replies[Math.floor(Math.random() * replies.length)];
        
                    await sock.sendPresenceUpdate('composing', sender);
                    await new Promise(res => setTimeout(res, 2000));
        
                    await sock.sendMessage(sender, { text: reply });
        
                    console.log(`\x1b[32m[REPLY]\x1b[0m 🦏 Auto respon user baru`);
                }
        
            }, Math.floor(Math.random() * 3000) + 2000); // 2–5 detik
        }

        // --- 3. AUTO REPLY PC (1-3m SIANG, 3-5m MALAM) ---
        if (!isGroup) {
        
            if (!global.pcCooldown) global.pcCooldown = {};
            if (sender.includes(phoneNumber)) return;
            const now = Date.now();
            if (global.pcCooldown[sender] && now - global.pcCooldown[sender] < 300000) return;
            global.pcCooldown[sender] = now;
        
            let delay = isLateNight() ? 
                Math.floor(Math.random() * (300000 - 180000)) + 180000 : 
                Math.floor(Math.random() * (180000 - 60000)) + 60000;
        
            setTimeout(async () => {
                const call = getRandomCall();
        
                const firstMsg = [
                    `iya ${call}`.trim(),
                    `hmm ${call}`.trim(),
                    `oke ${call}`.trim(),
                    `wkwk iya juga ${call}`.trim()
                ];
        
                const secondMsg = [
                    `lagi sibuk dikit 😅`.trim(),
                    `ntar lanjut ya`.trim(),
                    `lagi ada kerjaan`.trim(),
                    `bentar ya ${call}`.trim()
                ];
        
                const msg1 = firstMsg[Math.floor(Math.random() * firstMsg.length)];
                const msg2 = secondMsg[Math.floor(Math.random() * secondMsg.length)];
        
                // typing
                await sock.sendPresenceUpdate('composing', sender);
                await new Promise(res => setTimeout(res, 2000));
        
                await sock.sendMessage(sender, { text: msg1 });
        
                // delay antar pesan
                await new Promise(res => setTimeout(res, Math.random() * 5000 + 3000));
        
                await sock.sendPresenceUpdate('composing', sender);
                await new Promise(res => setTimeout(res, 2000));
        
                await sock.sendMessage(sender, { text: msg2 });
        
                console.log(`\x1b[34m[DONE]\x1b[0m Balas 2 tahap ke ${pushName}`);
            }, delay);
        }

        // --- 4. NIMBRUNG GRUP (RANDOM 45%) ---
        if (isGroup && Math.random() < 0.45 && !textMessage.includes("farming")) {
            const groupDelay = Math.floor(Math.random() * 8000) + 4000;
            setTimeout(async () => {
                const replies = ["wkwk", "siap", "oke", "gas", "mantap"];
                const reply = `${replies[Math.floor(Math.random() * replies.length)]} ${getRandomCall()}`;
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                console.log(`\x1b[35m[GRUP]\x1b[0m 🦏 Nimbrung.`);
            }, groupDelay);
        }
    });

    let autoPCRunning = false;

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') {
            console.log(`\n\x1b[42m\x1b[30m ONLINE \x1b[0m 🦏 ${phoneNumber} Connected!\n`);
    
            if (!autoPCRunning) {
                autoPCRunning = true;
                startAutoPC(sock);
            }
        }
    
        if (u.connection === 'close') {
            const shouldReconnect = (u.lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot(phoneNumber);
        }
    });
}
async function sendPC(sock, jid) {
    const now = Date.now();

    // cooldown 30 menit per user
    if (global.lastPC[jid] && now - global.lastPC[jid] < 1800000) return;

    global.lastPC[jid] = now;

    const call = getRandomCall();

    const texts = [
        `halo ${call}, apa kabar?`.trim(),
        `lagi ngapain ${call}?`.trim(),
        `udah lama ga chat ${call}`.trim(),
        `sehat ${call}?`.trim()
    ];

    const textMsg = texts[Math.floor(Math.random() * texts.length)];

    try {
        // typing
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(res => setTimeout(res, 2000));

        await sock.sendMessage(jid, { text: textMsg });
        console.log(`[PC] Teks ke ${jid}`);

        // 50% kirim VN
        if (Math.random() < 0.5) {
            await new Promise(res => setTimeout(res, 4000));

            await sock.sendMessage(jid, {
                audio: fs.readFileSync('./vn.mp3'),
                mimetype: 'audio/mp4',
                ptt: true
            });

            console.log(`[PC] VN ke ${jid}`);
        }

    } catch (e) {
        console.log(`Error PC ke ${jid}:`, e.message);
    }
}
async function startAutoPC(sock) {
    console.log("[AUTO PC] Jalan...");

    while (true) {
        const users = getRecentUsers();

        if (users.length === 0) {
            console.log("Tidak ada target");
        } else {
            // pilih random 1–2 orang
            const shuffled = users.sort(() => 0.5 - Math.random());
            const targets = shuffled.slice(0, Math.floor(Math.random() * 2) + 1);

            for (const jid of targets) {
                await sendPC(sock, jid);

                // jeda antar user (biar natural)
                await new Promise(res => setTimeout(res, Math.random() * 15000 + 10000));
            }
        }

        // delay loop 5–10 menit
        const delay = Math.random() * (600000 - 300000) + 300000;

        const min = Math.floor(delay / 60000);
        console.log(`[AUTO PC] Nunggu ${min} menit...`);

        await new Promise(res => setTimeout(res, delay));
    }
}
async function run() {
    process.stdout.write('\x1Bc');

    console.log(`\x1b[33m
=========================================
      🦏 WARMING UP WHATSAPP 🦏      
=========================================\x1b[0m`);

    const sessions = getSavedSessions();

    if (sessions.length > 0) {
        console.log(`\n\x1b[32m[✓] Session ditemukan:\x1b[0m`);
        sessions.forEach((s, i) => {
            console.log(`${i + 1}. ${s}`);
        });

        console.log(`\n0. Tambah nomor baru`);

        const pilih = await question('\nPilih nomor (contoh: 1 / 1,2 / all): ');

        if (pilih.toLowerCase() === 'all') {
            for (const num of sessions) {
                await startBot(num);
                await new Promise(res => setTimeout(res, 5000));
            }
            return;
        }

        if (pilih === '0') {
            const input = await question('Masukkan nomor baru: ');
            const num = input.replace(/[^0-9]/g, '');
            if (num.length > 10) await startBot(num);
            return;
        }

        const indexes = pilih.split(',').map(x => parseInt(x.trim()) - 1);

        for (const i of indexes) {
            if (sessions[i]) {
                await startBot(sessions[i]);
                await new Promise(res => setTimeout(res, 5000));
            }
        }

    } else {
        // kalau belum ada session sama sekali
        const input = await question('\x1b[35m[?]\x1b[0m Masukkan nomor WA: ');
        const num = input.replace(/[^0-9]/g, '');

        if (num.length > 10) await startBot(num);
    }
}

run();
