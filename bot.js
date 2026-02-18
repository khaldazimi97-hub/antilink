const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const userWarnings = new Map();

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "anti-link" }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--disable-gpu'
        ],
        headless: true
    }
});

client.on('qr', (qr) => {
    console.log('\n🟢 اسکن کن داداش:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ ربات وصل شد!');
});

function hasLink(text) {
    if (!text) return false;
    return /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(t\.me\/\S+)|(chat\.whatsapp\.com\/\S+)/i.test(text);
}

client.on('message', async (msg) => {
    try {
        if (!msg.author) return;
        
        const chat = await msg.getChat();
        const botNumber = client.info.wid._serialized;
        const botParticipant = chat.participants.find(p => p.id._serialized === botNumber);
        
        if (!botParticipant || !botParticipant.isAdmin) return;
        
        if (hasLink(msg.body)) {
            const userId = msg.author;
            const groupId = chat.id._serialized;
            const warningKey = `${groupId}_${userId}`;
            
            let warnings = userWarnings.get(warningKey) || 0;
            
            if (warnings === 0) {
                userWarnings.set(warningKey, 1);
                await msg.reply('⚠️ اخطار ۱: لینک نزن!');
                
            } else if (warnings === 1) {
                await msg.delete(true);
                await chat.removeParticipants([userId]);
                await chat.sendMessage(`🚫 کاربر ${userId.split('@')[0]} حذف شد`);
                userWarnings.delete(warningKey);
            }
        }
    } catch (err) {
        console.log('خطا:', err.message);
    }
});

setInterval(() => {
    userWarnings.clear();
}, 60 * 60 * 1000);

client.initialize();

process.on('SIGINT', async () => {
    await client.destroy();
    process.exit(0);
});
