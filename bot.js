const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ذخیره اخطارها
const warnings = new Map();

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "anti-link-bot" }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    }
});

client.on('qr', (qr) => {
    console.log('🟢 QR Code:');
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
        // فقط پیام‌های گروه
        if (!msg.author) return;

        const chat = await msg.getChat();
        
        // چک کردن ادمین بودن ربات
        const botNumber = client.info.wid._serialized;
        const botParticipant = chat.participants.find(p => p.id._serialized === botNumber);
        
        if (!botParticipant || !botParticipant.isAdmin) return;

        // اگه لینک داشت
        if (hasLink(msg.body)) {
            const userId = msg.author;
            const groupId = chat.id._serialized;
            const warningKey = `${groupId}_${userId}`;
            
            // پاک کردن پیام لینک دار (در هر صورت)
            try {
                await msg.delete(true);
                console.log(`🗑️ لینک پاک شد از ${userId}`);
            } catch (err) {
                console.log('❌ نتونستم لینک رو پاک کنم:', err.message);
            }
            
            // گرفتن تعداد اخطار قبلی
            let userWarnings = warnings.get(warningKey) || 0;
            
            if (userWarnings === 0) {
                // دفعه اول: هشدار
                userWarnings = 1;
                warnings.set(warningKey, userWarnings);
                
                await chat.sendMessage(`⚠️ @${userId.split('@')[0]}  :لینک فرستادی! دفعه دوم اخراج میشی!ربات ساخته شده توسط خالد عظیمی 0764007513`, {
                    mentions: [userId]
                });
                console.log(`⚠️ اخطار اول به ${userId}`);
                
            } else {
                // دفعه دوم و بیشتر: اخراج
                try {
                    await chat.removeParticipants([userId]);
                    await chat.sendMessage(`🚫 @${userId.split('@')[0]} به دلیل ارسال مجدد لینک اخراج شد!ربات ساخته شده توسط خالد عظیمی 0764007513`);
                    
                    // پاک کردن از حافظه
                    warnings.delete(warningKey);
                    console.log(`🚫 کاربر ${userId} اخراج شد`);
                    
                } catch (err) {
                    console.log('❌ نتونستم اخراجش کنم:', err.message);
                    await chat.sendMessage(`❌ نتونستم @${userId.split('@')[0]} رو اخراج کنم، احتمالاً دسترسی ندارم`);
                }
            }
        }
    } catch (err) {
        console.log('خطا:', err.message);
    }
});

// پاکسازی دوره‌ای حافظه (هر ۲ ساعت)
setInterval(() => {
    warnings.clear();
    console.log('🧹 حافظه پاکسازی شد');
}, 2 * 60 * 60 * 1000);

client.initialize();
// اضافه کن به آخر فایل bot.js
const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.send('ربات زنده است!');
});

app.listen(port, () => {
    console.log(`سرور پینگ روی پورت ${port}`);
});
