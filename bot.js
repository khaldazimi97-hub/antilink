const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const warnings = new Map();
let clientInstance = null;
let isRestarting = false;

// شناسه ثابت برای نشست (خیلی مهم برای نگه داشتن لاگین)
const SESSION_ID = `anti-link-session`;

// تشخیص محیط اجرا
const isReplit = process.env.REPL_ID || process.env.REPLIT_DB_URL;
const isKoyeb = process.env.KOYEB_APP_NAME;

// تابع جدید برای پاک کردن فایل قفل (جایگزین ترفند پوشه موقت)
async function cleanSessionLock() {
    try {
        // مسیر پیش‌فرض ذخیره نشست
        const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-${SESSION_ID}`);
        const lockFile = path.join(sessionPath, 'SingletonLock');
        
        try {
            await fs.rm(lockFile, { force: true });
            console.log('🔓 فایل قفل سشن پاک شد (امن در برابر کرش).');
        } catch (e) {
            // اگر فایل وجود نداشته باشد مشکلی نیست
        }
    } catch (err) {
        console.log('خطای بررسی سشن:', err.message);
    }
}

async function clearAuthOnFailure() {
    const authPath = path.join(process.cwd(), '.wwebjs_auth');
    try {
        await fs.rm(authPath, { recursive: true, force: true });
        console.log('🧹 کش احراز هویت پاک شد');
        return true;
    } catch (err) {
        return false;
    }
}

async function initializeBot() {
    if (isRestarting) return;
    isRestarting = true;

    if (clientInstance) {
        try { await clientInstance.destroy(); } catch (e) {}
        clientInstance = null;
    }
    
    // پاکسازی قفل قبل از شروع
    await cleanSessionLock();

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
                '--disable-extensions'
            ],
            headless: true,
            // اصلاح مهم: userDataDir حذف شد تا با LocalAuth تداخل نداشته باشد
            executablePath: isReplit ? 'chromium' : (isKoyeb ? '/usr/bin/chromium-browser' : undefined),
        },
        authStrategy: new LocalAuth({
            clientId: SESSION_ID, // آیدی ثابت
            dataPath: './.wwebjs_auth'
        })
    });

    clientInstance = client;

    // ریستارت خودکار هر 4 ساعت
    const RESTART_INTERVAL = 4 * 60 * 60 * 1000;
    if (global.autoRestartTimer) clearTimeout(global.autoRestartTimer);
    global.autoRestartTimer = setTimeout(() => {
        console.log('⏰ زمان ریستارت خودکار (خالی کردن رم)...');
        process.exit(0);
    }, RESTART_INTERVAL);

    client.on('qr', (qr) => {
        console.log('\n🟢 اسکن کن داداش:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('✅ ربات آماده است!');
        isRestarting = false;
    });

    client.on('authenticated', () => {
        console.log('🔐 احراز هویت شد');
    });

    client.on('auth_failure', async (msg) => {
        console.error('❌ خطای احراز هویت:', msg);
        await clearAuthOnFailure();
        process.exit(1);
    });

    client.on('disconnected', async (reason) => {
        console.log('🔌 قطع شد:', reason);
        setTimeout(() => {
            isRestarting = false;
            initializeBot();
        }, 3000);
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
                
                try {
                    await msg.delete(true);
                } catch (err) { return; }
                
                let userWarnings = warnings.get(warningKey) || 0;
                
                if (userWarnings === 0) {
                    userWarnings = 1;
                    warnings.set(warningKey, userWarnings);
                    await chat.sendMessage(`⚠️ @${userId.split('@')[0]}  creator:0764007513لینک فرستادی! دفعه بعد اخراج میشی!`, { mentions: [userId] });
                } else {
                    try {
                        await chat.removeParticipants([userId]);
                        await chat.sendMessage(`🚫 @${userId.split('@')[0]} اخراج شد!`);
                        warnings.delete(warningKey);
                    } catch (err) {}
                }
            }
        } catch (err) {}
    });

    try {
        await client.initialize();
    } catch (err) {
        console.error('خطا در راه اندازی:', err);
        setTimeout(() => {
            isRestarting = false;
            initializeBot();
        }, 5000);
    }
}

app.get('/', (req, res) => res.send('ربات آنلاین است 🤖'));

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ سرور روی پورت ${port}`);
    initializeBot();
});

process.on('unhandledRejection', (reason) => console.log('⚠️ خطای نادیده گرفته شده:', reason));
process.on('uncaughtException', (err) => {
    console.log('⚠️ خطای سیستمی:', err.message);
    if (err.message.includes('Session closed') || err.message.includes('Target closed')) {
        isRestarting = false;
        initializeBot();
    }
});
