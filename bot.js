const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const port = 3000;
const warnings = new Map();

// سرور پینگ
app.get('/', (req, res) => {
    res.send('ربات آنلاین است 🤖');
});

app.listen(port, () => {
    console.log(`✅ سرور پینگ روی پورت ${port}`);
});

// تنظیمات ویژه برای ریپلیت
const client = new Client({
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-extensions',
            '--disable-features=VizDisplayCompositor',
            '--disable-features=UseOzonePlatform',
            '--disable-software-rasterizer',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ],
        headless: true,
        executablePath: 'chromium'  // مسیر مستقیم کرومیوم
    },
    authStrategy: new LocalAuth({
        clientId: 'anti-link-bot',
        dataPath: './.wwebjs_auth'  // مسیر ذخیره اطلاعات
    })
});

client.on('qr', (qr) => {
    console.log('\n🟢 اسکن کن داداش:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ ربات آماده است!');
});

// تشخیص لینک
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
            
            // پاک کردن پیام
            try {
                await msg.delete(true);
                console.log(`🗑️ لینک پاک شد`);
            } catch (err) {
                console.log('❌ نتونستم پاک کنم');
            }
            
            let userWarnings = warnings.get(warningKey) || 0;
            
            if (userWarnings === 0) {
                userWarnings = 1;
                warnings.set(warningKey, userWarnings);
                await chat.sendMessage(`⚠️ @${userId.split('@')[0]} لینک فرستادی! دفعه بعد اخراج میشی!`, {
                    mentions: [userId]
                });
            } else {
                try {
                    await chat.removeParticipants([userId]);
                    await chat.sendMessage(`🚫 @${userId.split('@')[0]} اخراج شد!`);
                    warnings.delete(warningKey);
                } catch (err) {
                    console.log('❌ نتونستم اخراج کنم');
                }
            }
        }
    } catch (err) {
        console.log('خطا:', err.message);
    }
});

// پاکسازی حافظه
setInterval(() => {
    warnings.clear();
    console.log('🧹 حافظه پاک شد');
}, 60 * 60 * 1000);

client.initialize();

// مدیریت خطاهای بحرانی
process.on('uncaughtException', (err) => {
    console.log('خطای ناشناخته:', err.message);
    if (err.message.includes('profile')) {
        console.log('🔄 مشکل پروفایل - پاک کن و دوباره اجرا کن');
    }
});
