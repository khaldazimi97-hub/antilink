const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const app = express();
const port = process.env.PORT || 3000;
const warnings = new Map();
let clientInstance = null;
let profileDir = null;
let isRestarting = false; // جلوگیری از ریستارت‌های همزمان

// تشخیص محیط اجرا
const isReplit = process.env.REPL_ID || process.env.REPLIT_DB_URL;
const isKoyeb = process.env.KOYEB_APP_NAME;

async function setupProfile() {
    // استفاده از ID ثابت در محیط‌های ابری برای جلوگیری از پر شدن هاست
    // یا ID تصادفی برای جلوگیری از تداخل در اجراهای موازی
    const uniqueId = `bot-session-${process.env.REPL_ID || process.env.KOYEB_APP_NAME || Date.now()}`;
    const tempDir = path.join(os.tmpdir(), uniqueId);
    
    // فقط لاگ می‌گیریم، پاکسازی بعداً انجام می‌شود
    console.log(`📁 پروفایل مرورگر: ${tempDir}`);
    
    try {
        await fs.mkdir(tempDir, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
    return tempDir;
}

async function cleanOldProfiles() {
    // این تابع در پس‌زمینه اجرا می‌شود تا سرعت بالا آمدن ربات کم نشود
    try {
        const files = await fs.readdir(os.tmpdir());
        const currentId = `bot-session-${process.env.REPL_ID || process.env.KOYEB_APP_NAME || ''}`;
        
        for (const file of files) {
            if (file.startsWith('bot-session-') && file !== currentId) {
                // فقط پوشه‌های دیگر را پاک کن (پروسه‌های دیگر ممکن است در حال اجرا باشند)
                // برای ساده‌سازی، پاکسازی قدیمی‌ها را اینجا انجام می‌دهیم
                 try {
                    const filePath = path.join(os.tmpdir(), file);
                    const stats = await fs.stat(filePath);
                    // پاک کردن اگر قدیمی‌تر از ۲ ساعت است
                    if (Date.now() - stats.birthtimeMs > 2 * 60 * 60 * 1000) {
                        await fs.rm(filePath, { recursive: true, force: true });
                        console.log(`🧹 پاک شد: ${file}`);
                    }
                } catch (e) {}
            }
        }
    } catch (err) {
        console.log('خطای پاکسازی:', err.message);
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
    // جلوگیری از ریستارت‌های همزمان
    if (isRestarting) return;
    isRestarting = true;

    // نابودی کلاینت قبلی اگر وجود دارد
    if (clientInstance) {
        try { 
            await clientInstance.destroy(); 
        } catch (e) {
            console.log('تخریب کلاینت قبلی با خطا (طبیعی است):', e.message);
        }
        clientInstance = null;
    }
    
    // آماده‌سازی پروفایل مرورگر
    profileDir = await setupProfile();
    
    // پاکسازی در پس‌زمینه
    setTimeout(cleanOldProfiles, 5000);

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
            // اگر isReplit نباشد و isKoyeb هم نباشد، null می‌ماند تا از Chromium داخلی استفاده شود
            executablePath: isReplit ? 'chromium' : (isKoyeb ? '/usr/bin/chromium-browser' : undefined),
            userDataDir: profileDir
        },
        authStrategy: new LocalAuth({
            clientId: `anti-link-${process.env.REPL_ID || process.env.KOYEB_APP_NAME || 'v1'}`,
            dataPath: './.wwebjs_auth'
        })
    });

    clientInstance = client;

    client.on('qr', (qr) => {
        console.log('\n🟢 اسکن کن داداش:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('✅ ربات آماده است!');
        isRestarting = false; // اجازه ریستارت بعدی داده شود
    });

    client.on('authenticated', () => {
        console.log('🔐 احراز هویت شد');
    });

    client.on('auth_failure', async (msg) => {
        console.error('❌ خطای احراز هویت:', msg);
        await clearAuthOnFailure();
        console.log('🔄 برنامه ریستارت می‌شود...');
        process.exit(1); // پلتفرم باید برنامه را دوباره بالا بیاورد
    });

    // مهمترین بخش برای پایداری
    client.on('disconnected', async (reason) => {
        console.log('🔌 قطع شد:', reason);
        
        // اگر قطعی به دلیل لوگ‌اوت یا نویگیشن باشد، تلاش برای اتصال مجدد
        // نکته: اینجا نباید client.initialize را صدا بزنیم. باید کلاینت جدید بسازیم.
        
        if (reason === 'NAVIGATION' || reason === 'LOGOUT' || reason === 'RESTART') {
             console.log('🔄 در حال ساخت کلاینت جدید...');
             // تاخیر ۳ ثانیه برای اینکه پروسه‌های قبلی کاملاً بسته شوند
             setTimeout(() => {
                 isRestarting = false; // اجازه ریستارت مجدد
                 initializeBot();
             }, 3000);
        }
    });

    function hasLink(text) {
        if (!text) return false;
        // رگکس بهبود یافته برای لینک‌های شورت و بدون http
        return /(https?:\/\/[^\s]+)|(www\.[^\s]+)|(t\.me\/\S+)|(chat\.whatsapp\.com\/\S+)|(\S+\.(com|ir|org|net|io)(\/\S*)?)/i.test(text);
    }

    client.on('message', async (msg) => {
        try {
            if (!msg.author) return;

            const chat = await msg.getChat();
            // بررسی اینکه ربات ادمین است
            const botNumber = client.info.wid._serialized;
            const botParticipant = chat.participants.find(p => p.id._serialized === botNumber);
            
            if (!botParticipant || !botParticipant.isAdmin) return;

            if (hasLink(msg.body)) {
                const userId = msg.author;
                const groupId = chat.id._serialized;
                const warningKey = `${groupId}_${userId}`;
                
                try {
                    await msg.delete(true);
                    console.log(`🗑️ لینک پاک شد از ${userId.split('@')[0]}`);
                } catch (err) {
                    console.log('❌ نتونستم پاک کنم (شاید دسترسی نیست)');
                    return;
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
            console.log('خطای پردازش پیام:', err.message);
        }
    });

    setInterval(() => {
        warnings.clear();
        console.log('🧹 حافظه اخطارها پاک شد');
    }, 60 * 60 * 1000);

    try {
        await client.initialize();
    } catch (err) {
        console.error('خطا در راه اندازی اولیه:', err);
        setTimeout(() => {
            isRestarting = false;
            initializeBot();
        }, 5000);
    }
}

// سرور پینگ
app.get('/', (req, res) => {
    res.send('ربات آنلاین است 🤖');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`✅ سرور روی پورت ${port}`);
    initializeBot();
});

// هندل کردن خطاهای سیستمی (جلوگیری از کرش کامل)
process.on('unhandledRejection', (reason, promise) => {
    console.log('⚠️ Unhandled Rejection (نادیده گرفته شد):', reason);
    // اینجا برنامه نباید بسته شود، اما لاگ می‌شود
});

process.on('uncaughtException', (err) => {
    console.log('⚠️ Uncaught Exception:', err);
    // اگر خطا خیلی جدی است، بهتر است ریستارت شود
    if (err.message.includes('Session closed') || err.message.includes('Target closed')) {
        console.log('🔄 خطای جلسه بسته شده، ریستارت...');
        initializeBot();
    }
});

process.on('SIGTERM', async () => {
    console.log('خاموش شدن سیستم...');
    if (profileDir) {
        try { await fs.rm(profileDir, { recursive: true, force: true }); } catch (e) {}
    }
    process.exit(0);
});
