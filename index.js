const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');

async function startBot() {
    // Menyimpan sesi login di folder 'auth_info'
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    // Konfigurasi koneksi
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }), // Silent logger biar terminal bersih
        printQRInTerminal: false, // Matikan QR Code
        auth: state,
        browser: ['Bot WhatsApp', 'Chrome', '1.0.0']
    });

    // Event jika koneksi terputus
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Jika ada QR (seharusnya tidak ada jika pakai pairing code logic, tapi jaga-jaga)
        if(qr) {
            console.log('Scan QR ini jika muncul:', qr);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menyambung ulang...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot berhasil terhubung!');
            
            // KODE UNTUK MINTA PAIRING CODE
            // Jika belum login, minta kode
            if (!sock.authState.creds.registered) {
                const phoneNumber = "6281234567890"; // GANTI DENGAN NOMOR ANDA
                console.log(`Meminta kode pairing untuk nomor: ${phoneNumber}...`);
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`🔑 Kode Pairing Anda: ${code}`);
                console.log('Masukkan kode ini di WhatsApp Anda (Settings -> Linked Devices -> Link with phone number).');
            }
        }
    });

    // Menyimpan kredensial saat login berhasil
    sock.ev.on('creds.update', saveCreds);

    // Logika Balas Pesan
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        
        // Abaikan pesan dari bot sendiri atau pesan status
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        console.log(`Pesan dari ${sender}: ${text}`);

        // Logika Bot Sederhana
        if (text) {
            const textLower = text.toLowerCase();
            if (textLower === 'halo') {
                await sock.sendMessage(sender, { text: 'Halo! Saya bot via Pairing Code.' });
            } else if (textLower === '!ping') {
                await sock.sendMessage(sender, { text: 'Pong! 🏓' });
            }
        }
    });
}

startBot();