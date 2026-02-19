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
let isRestarting = false;

const isReplit = process.env.REPL_ID || process.env.REPLIT_DB_URL;
const isKoyeb = process.env.KOYEB_APP_NAME;

async function setupProfile() {
    const uniqueId = `bot-session-${process.env.REPL_ID || process.env.KOYEB_APP_NAME || Date.now()}`;
    const tempDir = path.join(os.tmpdir(), uniqueId);
    console.log(`📁 پروفایل مرورگر: ${tempDir}`);
    try {
        await fs.mkdir(tempDir, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
    return tempDir;
}

async function cleanOldProfiles() {
    try {
        const files = await fs.readdir(os.tmpdir());
        const currentId = `bot-session-${process.env.REPL_ID || process.env.KOYEB_APP_NAME || ''}`;
        for (const file of files) {
            if (file.startsWith('bot-session-') && file !== currentId) {
                 try {
                    const filePath = path.join(os.tmpdir(), file);
                    const stats = await fs.stat(filePath);
                    if (Date.now() - stats.birthtimeMs > 2 * 60 * 60 * 1000) {
                        await fs.rm(filePath, { recursive: true, force: true });
                    }
                } catch (e) {}
            }
        }
    } catch (err) {}
}

async function clearAuthOnFailure() {
    const authPath = path.join(process.cwd(), '.wwebjs_auth');
    try {
        await fs.rm(authPath, { recursive: true, force: true });
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
    
    profileDir = await setupProfile();
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
            executablePath: isReplit ? 'chromium' : (isKoyeb ? '/usr/bin/chromium-browser' : undefined),
            userDataDir: profileDir
        },
        authStrategy: new LocalAuth({
            clientId: `anti-link-${process.env.REPL_ID || process.env.KOYEB_APP_NAME || 'v1'}`,
            dataPath: './.wwebjs_auth'
        })
    });

    clientInstance = client;

    // ⏰⏰⏰ اینجا کد ریستارت خودکار اضافه شده ⏰⏰⏰
    const RESTART_INTERVAL = 4 * 60 * 60 * 1000; // هر 4 ساعت
    if (global.autoRestartTimer) clearTimeout(global.autoRestartTimer);
    global.autoRestartTimer = setTimeout(() => {
        console.log('⏰ زمان ریستارت خودکار (خالی کردن رم)...');
        process.exit(0);
    }, RESTART_INTERVAL);
    // ----------------------------------------

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
                    await chat.sendMessage(`⚠️ @${userId.split('@')[0]}  لینک فرستادی! دفعه بعد اخراج میشی سازنده خالد عظیمی 0764007513!`, { mentions: [userId] });
                } else {
                    try {
                        await chat.removeParticipants([userId]);
                        await chat.sendMessage(`🚫 @${userId.split('@')[0]} اخراج شد! creator khalid azimi 0764007513`);
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
    if (err.message.includes('Session closed')) {
        isRestarting = false;
        initializeBot();
    }
});

process.on('SIGTERM', async () => {
    if (profileDir) try { await fs.rm(profileDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(0);
});
