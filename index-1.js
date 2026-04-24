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

// --- HELPERS ---
const isLateNight = () => {
    const hour = new Date().getHours();
    return (hour >= 23 || hour <= 5); 
};

const getRandomCall = () => {
    const calls = ["om", "kak", "bang", "gan", "hu", "mas", "dek", "ndan", "lur"];
    return calls[Math.floor(Math.random() * calls.length)];
};

const getChatWord = () => {
    try {
        const data = fs.readJsonSync('./kata.json');
        let word = data.list[Math.floor(Math.random() * data.list.length)];
        return `${word} ${getRandomCall()}`;
    } catch (e) { return `iya ${getRandomCall()}`; }
};

async function startBot(phoneNumber) {
    const sessionPath = `./sessions/session_${phoneNumber}`;
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

        // --- 1. FITUR AUTO PM DARI GRUP (TARGET FARMING) ---
        if (isGroup && textMessage.includes("farming")) {
            console.log(`\x1b[31m[TARGET]\x1b[0m 🦏 Deteksi kata "farming" di grup. Otw PM!`);
            setTimeout(async () => {
                const sapaan = ["P", "Halo", "Izin save ndan", "Farming mas"];
                const teksPM = sapaan[Math.floor(Math.random() * sapaan.length)];
                await sock.sendMessage(participant, { text: teksPM });
                console.log(`\x1b[36m[PM SENT]\x1b[0m 🦏 Berhasil PM ke ${pushName}`);
            }, 5000); // Jeda 5 detik biar gak kaget
        }

        // --- 2. AUTO SAVE KONTAK ---
        const triggers = ["p", "halo", "save", "izin", "farming"];
        if (triggers.some(t => textMessage.includes(t))) {
            const vcf = `BEGIN:VCARD\nVERSION:3.0\nFN:${pushName}\nTEL;TYPE=CELL:${participant.split('@')[0]}\nEND:VCARD\n`;
            fs.appendFileSync('./database_kontak.vcf', vcf);
            console.log(`\x1b[36m[SAVE]\x1b[0m 🦏 Kontak Tersimpan.`);
        }

        // --- 3. AUTO REPLY PC (1-3m SIANG, 3-5m MALAM) ---
        if (!isGroup) {
            let delay = isLateNight() ? 
                Math.floor(Math.random() * (300000 - 180000)) + 180000 : 
                Math.floor(Math.random() * (180000 - 60000)) + 60000;

            const min = Math.floor(delay / 60000);
            const sec = Math.floor((delay % 60000) / 1000);
            console.log(`\x1b[33m[WAIT]\x1b[0m 🦏 Tunggu ${min}m ${sec}s...`);

            setTimeout(async () => {
                const response = getChatWord();
                await sock.sendPresenceUpdate('composing', sender);
                await new Promise(res => setTimeout(res, 4000));
                await sock.sendMessage(sender, { text: response });
                console.log(`\x1b[34m[DONE]\x1b[0m Balas ${pushName}: ${response}`);
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

    sock.ev.on('connection.update', (u) => {
        if (u.connection === 'open') console.log(`\n\x1b[42m\x1b[30m ONLINE \x1b[0m 🦏 ${phoneNumber} Connected!\n`);
        if (u.connection === 'close') {
            const shouldReconnect = (u.lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot(phoneNumber);
        }
    });
}

async function run() {
    process.stdout.write('\x1Bc');
    console.log(`\x1b[33m
=========================================
      🦏 BADAK KEUNNN V1 BY KENNY 🦏      
=========================================\x1b[0m`);
    
    const input = await question('\x1b[35m[?]\x1b[0m Masukkan nomor WA: ');
    const numbers = input.split(',').map(n => n.trim().replace(/[^0-9]/g, ''));
    
    for (const num of numbers) {
        if (num.length > 10) {
            await startBot(num);
            await new Promise(res => setTimeout(res, 5000));
        }
    }
}

run();
