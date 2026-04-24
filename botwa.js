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

// ==========================================
//   📚 DATABASE KATA-KATA (MOTIVASI & BUCIN)
// ==========================================
const motivasiKerja = [
    "Masa depanmu ditentukan oleh apa yang kamu lakukan hari ini, bukan besok.",
    "Jangan tunggu kesempatan. Ciptakan kesempatan.",
    "Kerja keras mengalahkan bakat ketika bakat tidak bekerja keras.",
    "Jika kamu tidak sanggup menahan lelahnya belajar, maka kamu harus sanggup menahan perihnya kebodohan.",
    "Mimpi tidak akan bekerja kecuali kamu bekerja.",
    "Jangan biarkan kemarin mengambil terlalu banyak waktu hari ini.",
    "Sukses biasanya datang kepada mereka yang terlalu sibuk mencarinya.",
    "Perjalanan seribu mil dimulai dengan satu langkah.",
    "Jangan takut gagal, takutlah untuk tidak mencoba.",
    "Waktu terbaik untuk menanam pohon adalah 20 tahun yang lalu. Waktu terbaik kedua adalah sekarang."
];

const kataBucin = [
    "Aku bukan ingin memilikimu, aku hanya ingin mencintaimu tanpa memiliki.",
    "Cintamu bagaikan mentari yang selalu tersenyum padaku setiap pagi.",
    "Jika kamu adalah buku, aku akan membacamu berulang-ulang tanpa bosan.",
    "Sejak aku mengenalmu, waktu terasa begitu cepat berlalu karena bahagia.",
    "Kamu adalah alasan kenapa aku percaya pada takdir.",
    "Aku rela menunggu selamanya, asal akhirnya kamu.",
    "Kalau kamu jadi matahari, aku rela jadi planet yang mengorbitmu.",
    "Tidak ada kata lelah untuk orang yang dicintai.",
    "Cinta bukan tentang memiliki, tapi tentang memberi kebahagiaan.",
    "Setiap detik tanpamu terasa seperti setahun."
];

// ==========================================
//   🛠️ FUNGSI UTILITAS
// ==========================================
const isLateNight = () => {
    const hour = new Date().getHours();
    return (hour >= 23 || hour <= 5); 
};

const getRandomCall = () => {
    const calls = ["om", "kak", "bang", "bestie", "mas", "boss"];
    if (Math.random() < 0.4) return "";
    let call = calls[Math.floor(Math.random() * calls.length)];
    if (Math.random() < 0.2) {
        call = call.replace("a", "aa"); 
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

// Inisialisasi Global
if (!global.lastPC) global.lastPC = {};
if (!global.groupCooldown) global.groupCooldown = {};
if (!global.pcCooldown) global.pcCooldown = {};

function getSavedSessions() {
    const base = './sessions';
    if (!fs.existsSync(base)) return [];
    return fs.readdirSync(base)
        .filter(f => f.startsWith('session_'))
        .map(f => f.replace('session_', ''));
}

// ==========================================
//   🚀 FUNGSI UTAMA BOT
// ==========================================
async function startBot(phoneNumber) {
    const sessionPath = `./sessions/session_${phoneNumber}`;
    const USERS_FILE = `./users_${phoneNumber}.json`;
    const CONTACT_FILE = `./contacts_${phoneNumber}.json`;
    
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
    
    function loadContacts() {
        if (fs.existsSync(CONTACT_FILE)) {
            return new Set(JSON.parse(fs.readFileSync(CONTACT_FILE)));
        }
        return new Set();
    }
    
    function saveContacts(data) {
        fs.writeFileSync(CONTACT_FILE, JSON.stringify([...data]));
    }

    let savedContacts = loadContacts();
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
        const number = participant.split('@')[0];
        
        const textMessage = (
            msg.message.conversation || 
            msg.message.extendedTextMessage?.text || ""
        ).toLowerCase();
        
        // --- FIXED: Update recentUsers ---
        if (!isGroup) {
            if (!recentUsers.has(sender)) {
                recentUsers.add(sender);
                saveUsers(recentUsers);
                console.log(`[DB] ${pushName} ditambahkan ke target Auto PC.`);
            }
        }
        // ----------------------------------

        const time = new Date().toLocaleTimeString();
        console.log(`\n\x1b[90m------------------------------------------\x1b[0m`);
        console.log(`\x1b[37m[${time}]\x1b[0m \x1b[32m${pushName}\x1b[0m -> \x1b[33m${isGroup ? 'Grup' : 'Privat'}\x1b[0m`);
        console.log(`\x1b[37mMsg:\x1b[0m ${textMessage}`);
        
        // --- 1. AUTO REPLY GRUP (TRIGGER) ---
        const groupTriggers = ["farming", "chat", "save", "sv", "sve", "cht"];
        
        if (isGroup && groupTriggers.some(t => textMessage.includes(t))) {
            const now = Date.now();
            if (global.groupCooldown[sender] && now - global.groupCooldown[sender] < 4500) return;
            global.groupCooldown[sender] = now;
            
            const call = getRandomCall();
            const replies = [
                `chat duluan ${call} lagi kena batas, langsung ku save kok`.trim(),
                `lagi limit ${call}, chat aja dulu nanti ku save`.trim()
            ];
            const reply = replies[Math.floor(Math.random() * replies.length)];
        
            setTimeout(async () => {
                await sock.sendMessage(sender, { text: reply }, { quoted: msg });
                console.log(`\x1b[35m[GRUP REPLY]\x1b[0m 🦏 Respon trigger`);
            }, Math.floor(Math.random() * 5000) + 3000);
        }

        // --- 2. AUTO SAVE + AUTO REPLY (USER BARU) ---
        const saveTriggers = ["halo", "save", "sve", "farming", "p", "bang", "bg"];
        const words = textMessage.split(/\s+/);
        
        if (!savedContacts.has(number)) {
            savedContacts.add(number);
            saveContacts(savedContacts);
        }
        
        // FIXED: Hapus global.
        if (saveTriggers.some(t => words.includes(t)) && !savedContacts.has(number)) {
            savedContacts.add(number);
            saveContacts(savedContacts);

            setTimeout(async () => {
                const call = getRandomCall();
                const vcf = `BEGIN:VCARD
VERSION:3.0
FN:${pushName}
TEL;TYPE=CELL:${number}
END:VCARD
`;
                fs.appendFileSync('./database_kontak.vcf', vcf);
                console.log(`\x1b[36m[SAVE]\x1b[0m 🦏 ${pushName} (${number})`);
        
                if (!isGroup) {
                    const replies = [
                        `tolong save ${call} nomor mu udah aku save`.trim(),
                        `nomormu udah aku save ${call} tolong di save back🙏`.trim()
                    ];
                    const reply = replies[Math.floor(Math.random() * replies.length)];
        
                    await sock.sendPresenceUpdate('composing', sender);
                    await new Promise(res => setTimeout(res, 2000));
                    await sock.sendMessage(sender, { text: reply });
                    console.log(`\x1b[32m[REPLY]\x1b[0m 🦏 Auto respon user baru`);
                }
            }, Math.floor(Math.random() * 3000) + 2000);
        }

        // --- 3. AUTO REPLY PC ---
        if (!isGroup && !sender.includes(phoneNumber)) {
            const now = Date.now();
            if (!global.pcCooldown[sender] || now - global.pcCooldown[sender] >= 300000) {
                global.pcCooldown[sender] = now;
                
                let delay = isLateNight() ? 
                    Math.floor(Math.random() * (300000 - 180000)) + 180000 : 
                    Math.floor(Math.random() * (180000 - 60000)) + 60000;
            
                setTimeout(async () => {
                    const call = getRandomCall();
                    const firstMsg = [`iya ${call}`, `hmm ${call}`, `oke ${call}`];
                    const secondMsg = [`lagi sibuk dikit 😅`, `ntar lanjut ya`, `bentar ya ${call}`];
            
                    await sock.sendPresenceUpdate('composing', sender);
                    await new Promise(res => setTimeout(res, 2000));
                    await sock.sendMessage(sender, { text: firstMsg[Math.floor(Math.random() * firstMsg.length)] });
            
                    await new Promise(res => setTimeout(res, Math.random() * 5000 + 3000));
            
                    await sock.sendPresenceUpdate('composing', sender);
                    await new Promise(res => setTimeout(res, 2000));
                    await sock.sendMessage(sender, { text: secondMsg[Math.floor(Math.random() * secondMsg.length)] });
            
                    console.log(`\x1b[34m[DONE]\x1b[0m Balas 2 tahap ke ${pushName}`);
                }, delay);
            }
        }

        // --- 4. NIMBRUNG GRUP ---
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
    let autoGroupRunning = false;

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') {
            console.log(`\n\x1b[42m\x1b[30m ONLINE \x1b[0m 🦏 ${phoneNumber} Connected!\n`);
    
            if (!autoPCRunning) {
                autoPCRunning = true;
                startAutoPC(sock, recentUsers);
            }

            // ✅ FITUR BARU: AUTO GROUP BROADCAST
            if (!autoGroupRunning) {
                autoGroupRunning = true;
                startAutoGroupBroadcast(sock);
            }
        }
    
        if (u.connection === 'close') {
            const shouldReconnect = (u.lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot(phoneNumber);
        }
    });
}

// ==========================================
//   📢 FITUR AUTO GROUP BROADCAST (BARU)
// ==========================================
async function startAutoGroupBroadcast(sock) {
    console.log("\x1b[33m[AUTO GRUP] Fitur broadcast grup aktif (3 menit sekali).\x1b[0m");

    while (true) {
        try {
            // 1. Fetch semua grup
            const groups = await sock.groupFetchAllParticipating();
            const groupIds = Object.keys(groups);

            if (groupIds.length === 0) {
                console.log("[AUTO GRUP] Bot belum masuk grup manapun.");
            } else {
                // 2. Pilih 1 grup random (biar gak spam semua grup sekaligus)
                // Jika ingin kirim ke SEMUA grup sekaligus, gani loop ini ke for (let id of groupIds)
                const targetId = groupIds[Math.floor(Math.random() * groupIds.length)];
                const groupName = groups[targetId].subject;

                // 3. Siapkan konten (Random: Motivasi atau Bucin)
                const isMotivasi = Math.random() > 0.5;
                let textMsg;

                if (isMotivasi) {
                    textMsg = `🔥 *MOTIVASI HARI INI*\n\n${motivasiKerja[Math.floor(Math.random() * motivasiKerja.length)]}`;
                } else {
                    textMsg = `❤️ *BUCIN CORNER*\n\n${kataBucin[Math.floor(Math.random() * kataBucin.length)]}`;
                }

                // 4. Kirim Teks
                await sock.sendMessage(targetId, { text: textMsg });
                console.log(`\x1b[36m[AUTO GRUP]\x1b[0m Kirim motivasi/bucin ke: ${groupName}`);

                // 5. Kirim VN (Jika ada file vn.mp3)
                if (fs.existsSync('./vn.mp3')) {
                    // Delay sebentar sebelum VN
                    await new Promise(res => setTimeout(res, 3000));
                    
                    await sock.sendMessage(targetId, {
                        audio: fs.readFileSync('./vn.mp3'),
                        mimetype: 'audio/mp4',
                        ptt: true
                    });
                    console.log(`\x1b[36m[AUTO GRUP]\x1b[0m VN terkirim ke: ${groupName}`);
                }
            }
        } catch (e) {
            console.log("[AUTO GRUP] Error:", e.message);
        }

        // Delay 3 menit (180 detik) + random 1-60 detik biar tidak terlalu paten
        const delayMs = 180000 + Math.floor(Math.random() * 60000);
        const nextMinute = Math.round(delayMs / 60000);
        
        // Tidak perlu console.log menunggu setiap loop biar rapi
        await new Promise(res => setTimeout(res, delayMs));
    }
}

async function sendPC(sock, jid) {
    const now = Date.now();
    if (global.lastPC[jid] && now - global.lastPC[jid] < 1800000) return;

    global.lastPC[jid] = now;
    const call = getRandomCall();
    const texts = [`halo ${call}, apa kabar?`, `lagi ngapain ${call}?`, `udah lama ga chat ${call}`];
    const textMsg = texts[Math.floor(Math.random() * texts.length)];

    try {
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(res => setTimeout(res, 2000));
        await sock.sendMessage(jid, { text: textMsg });
        console.log(`[PC] Teks ke ${jid}`);

        if (Math.random() < 0.5 && fs.existsSync('./vn.mp3')) {
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

async function startAutoPC(sock, recentUsers) {
    console.log("[AUTO PC] Jalan...");
    while (true) {
        const users = Array.from(recentUsers);
        if (users.length > 0) {
            const shuffled = users.sort(() => 0.5 - Math.random());
            const targets = shuffled.slice(0, Math.floor(Math.random() * 2) + 1);

            for (const jid of targets) {
                await sendPC(sock, jid);
                await new Promise(res => setTimeout(res, Math.random() * 15000 + 10000));
            }
        }
        const delay = Math.random() * (600000 - 300000) + 300000;
        await new Promise(res => setTimeout(res, delay));
    }
}

async function run() {
    process.stdout.write('\x1Bc');
    console.log(`\x1b[33m=========================================
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
        const input = await question('\x1b[35m[?]\x1b[0m Masukkan nomor WA: ');
        const num = input.replace(/[^0-9]/g, '');
        if (num.length > 10) await startBot(num);
    }
}

run();
