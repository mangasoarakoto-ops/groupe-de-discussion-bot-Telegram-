const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc } = require("firebase/firestore");

// --- 1. CONFIGURATION ---
const token = process.env.TELEGRAM_BOT_TOKEN || '8525418474:AAHebHUTYrpKAq0Dr4UPPehYOYAacTMuYmA';
const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 8207051152;

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDPrTWmxovZdbbi0BmXr6Tn6AyrlaO0cbM",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "bot-asa-en-ligne-mada.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "bot-asa-en-ligne-mada",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "bot-asa-en-ligne-mada.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "837671675184",
    appId: process.env.FIREBASE_APP_ID || "1:837671675184:web:2cd55ef7eacac7e33554f5"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const bot = new TelegramBot(token, { polling: true });

// Express Server
const app = express();
app.get('/', (req, res) => res.send('Bot is running...'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- 2. VARIABLES & MENU ---
const userStates = {}; 
const pendingJobs = {}; // Hanara-maso ny asa mbola andrasana approval

const mainKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: '🔍 Hijery Asa' }, { text: '📝 Hizara Asa' }],
            [{ text: '🔄 Actualiser' }, { text: '📞 Admin' }, { text: '📊 Ny asa nataoko' }]
        ],
        resize_keyboard: true
    },
    parse_mode: 'Markdown'
};

// --- 3. LOGIQUE PRINCIPALE ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (msg.chat.type !== 'private') return;

    if (text === '/start') {
        delete userStates[chatId];
        return bot.sendMessage(chatId, `👋 **Salama ${msg.from.first_name}!**\nAfaka mandefa asa ianao ato. Ampiasao ny bokitra ambany.`, mainKeyboard);
    }

    if (userStates[chatId]) {
        return handleSteps(chatId, msg);
    }

    if (text === '🔍 Hijery Asa' || text === '🔄 Actualiser') {
        handleShowJobs(chatId);
    } 
    else if (text === '📝 Hizara Asa') {
        userStates[chatId] = { step: 'ASK_DESC' };
        bot.sendMessage(chatId, "📝 **Dingana 1/5**\nAlefaso ny **DESCRIPTION** ny asa:", { reply_markup: { remove_keyboard: true } });
    } 
    else if (text === '📞 Admin') {
        userStates[chatId] = { step: 'WAITING_FOR_ADMIN_MSG' };
        bot.sendMessage(chatId, "💬 Manorata ny hafatra tianao halefa any amin'ny Admin:", { 
            reply_markup: { keyboard: [[{text: '❌ Hanafoana'}]], resize_keyboard: true } 
        });
    }
    else if (text === '📊 Ny asa nataoko') {
        handleMyJobs(chatId);
    }
});

// --- 4. HANDLING STEPS ---

async function handleSteps(chatId, msg) {
    const state = userStates[chatId];
    const text = msg.text;

    // Chat amin'ny Admin
    if (state.step === 'WAITING_FOR_ADMIN_MSG' || state.step === 'ADMIN_SENDING_REPLY') {
        if (text === '❌ Hanafoana') {
            delete userStates[chatId];
            return bot.sendMessage(chatId, "Nofononina.", mainKeyboard);
        }
        
        if (state.step === 'ADMIN_SENDING_REPLY') {
            bot.sendMessage(state.targetId, `📩 **Valiny avy amin'ny Admin:**\n\n${text}`);
        } else {
            bot.sendMessage(ADMIN_ID, `📩 **Hafatra avy amin'i ${msg.from.first_name} (ID: ${chatId}):**\n\n${text}`, {
                reply_markup: { inline_keyboard: [[{ text: '💬 Hamaly azy', callback_data: `replyto_${chatId}` }]] }
            });
        }
        bot.sendMessage(chatId, "✅ Nalefa ny hafatra.", mainKeyboard);
        delete userStates[chatId];
        return;
    }

    // Hizara Asa Steps
    switch (state.step) {
        case 'ASK_DESC':
            state.description = text;
            state.step = 'ASK_LINK';
            bot.sendMessage(chatId, "🔗 **Dingana 2/5**\nAlefaso ny **LIEN D'INSCRIPTION**:");
            break;
        case 'ASK_LINK':
            if (!text || !text.startsWith('http')) return bot.sendMessage(chatId, "⚠️ Lien diso. Avereno:");
            state.link = text;
            state.step = 'ASK_PROOF_SITE';
            bot.sendMessage(chatId, "📸 **Dingana 3/5**\nAlefaso ny **SARY HISTORIQUE SITE** ho an'ny admin ihany:");
            break;
        case 'ASK_PROOF_SITE':
            if (!msg.photo) return bot.sendMessage(chatId, "⚠️ Sary azafady.");
            state.proofSite = msg.photo[msg.photo.length - 1].file_id;
            state.step = 'ASK_PROOF_TRANS';
            bot.sendMessage(chatId, "📸 **Dingana 4/5**\nAlefaso ny **SARY HISTORIQUE PORTEFEUILLE** ho an'ny admin ihany:");
            break;
        case 'ASK_PROOF_TRANS':
            if (!msg.photo) return bot.sendMessage(chatId, "⚠️ Sary azafady.");
            state.proofTrans = msg.photo[msg.photo.length - 1].file_id;
            state.step = 'ASK_PUBLIC_MEDIA';
            bot.sendMessage(chatId, "📂 **Dingana 5/5 (Ho hita public)**\nAlefaso ny sary/video/vocal **ho an'ny rehetra**:");
            break;
        case 'ASK_PUBLIC_MEDIA':
            const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : 
                           (msg.video ? msg.video.file_id : 
                           (msg.voice ? msg.voice.file_id : 
                           (msg.document ? msg.document.file_id : null)));
            
            if (!fileId) return bot.sendMessage(chatId, "⚠️ Fichier azafady.");
            
            state.publicMedia = fileId;
            state.mediaType = msg.photo ? 'photo' : (msg.video ? 'video' : (msg.voice ? 'voice' : 'doc'));

            try {
                // Tehirizina ao Firestore
                const jobData = {
                    userId: chatId,
                    name: msg.from.first_name,
                    username: msg.from.username || '',
                    description: state.description,
                    link: state.link,
                    proofSite: state.proofSite,
                    proofTrans: state.proofTrans,
                    publicMedia: state.publicMedia,
                    mediaType: state.mediaType,
                    status: 'pending',
                    createdAt: serverTimestamp()
                };
                
                const docRef = await addDoc(collection(db, "jobs"), jobData);
                
                // ALEFA ANY AMIN'NY ADMIN
                await sendReviewToAdmin(docRef.id, jobData);
                
                bot.sendMessage(chatId, "✅ Voaray ny asanao! **Miandry fankatoavana avy amin'ny Admin** izao.", mainKeyboard);
                
                // Hanamarina fa nahavita
                bot.sendMessage(chatId, "📋 **Famintinana ny asa nataonao:**\n" +
                    `📝: ${state.description}\n` +
                    `🔗: ${state.link}\n` +
                    `👤: ${msg.from.first_name}\n` +
                    `⏰: Miandry review avy amin'ny Admin`);
                
            } catch (e) {
                console.error("Error saving job:", e);
                bot.sendMessage(chatId, "⚠️ Nisy olana tamin'ny fametrahana asa. Andramo indray.");
            }
            delete userStates[chatId];
            break;
    }
}

// --- 5. ADMIN CALLBACKS ---

bot.on('callback_query', async (query) => {
    const data = query.data;
    
    // APPROVE na REJECT
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const [action, docId, targetId] = data.split('_');
        const jobRef = doc(db, "jobs", docId);
        
        try {
            // Alaina ny data voalohany
            const jobSnap = await getDoc(jobRef);
            if (!jobSnap.exists()) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Tsy hita ilay asa!" });
            }
            
            const jobData = jobSnap.data();
            
            if (action === 'approve') {
                await updateDoc(jobRef, { 
                    status: "approved",
                    approvedAt: serverTimestamp()
                });
                
                // Hampandre ny mpampiasa
                bot.sendMessage(targetId, "🎉 **NEEKEN'NY ADMIN NY ASA NAO!**\n\n" +
                    `📝: ${jobData.description}\n` +
                    `🔗: ${jobData.link}\n\n` +
                    "✅ **Efa hita public ny asanao!** Afaka mijery izany amin'ny '🔍 Hijery Asa' ny mpampiasa rehetra.");
                
                // Hamafa ny hafatra review
                bot.deleteMessage(query.message.chat.id, query.message.message_id);
                
                // Hampandre ny admin
                bot.sendMessage(ADMIN_ID, `✅ **Nehena ny asa:**\n${jobData.description}`);
                
            } else {
                await updateDoc(jobRef, { 
                    status: "rejected",
                    rejectedAt: serverTimestamp()
                });
                
                // Hampandre ny mpampiasa
                bot.sendMessage(targetId, "❌ **NOLAVIN'NY ADMIN NY ASA NAO.**\n\n" +
                    `📝: ${jobData.description}\n` +
                    `🔗: ${jobData.link}\n\n` +
                    "⚠️ **Tsy mety ny fepetra na ny antontan'asa.** Azafady andramo manova ny fomba fanaovanao na mifandray amin'ny admin.");
                
                // Hamafa ny hafatra review
                bot.deleteMessage(query.message.chat.id, query.message.message_id);
                
                // Hampandre ny admin
                bot.sendMessage(ADMIN_ID, `❌ **Nolavina ny asa:**\n${jobData.description}`);
            }
            
            bot.answerCallbackQuery(query.id, { text: `Asa ${action === 'approve' ? 'nekena' : 'nolavina'}!` });
            
        } catch (e) { 
            console.error("Error updating job:", e);
            bot.answerCallbackQuery(query.id, { text: "❌ Nisy olana!" });
        }
    }
    
    // REPLY to user
    if (data.startsWith('replyto_')) {
        const targetId = data.split('_')[1];
        userStates[ADMIN_ID] = { step: 'ADMIN_SENDING_REPLY', targetId: targetId };
        bot.sendMessage(ADMIN_ID, `✍️ **Manorata valiny ho an'i ${targetId}:**`, {
            reply_markup: { keyboard: [[{text: '❌ Hanafoana'}]], resize_keyboard: true }
        });
    }
});

// --- 6. SEND REVIEW TO ADMIN (FIXED) ---

async function sendReviewToAdmin(docId, jobData) {
    try {
        // 1. Aloha alefa ny hafatra fototra
        const messageText = `🆕 **ASA VAOVAO HOHAMARININA**\n\n` +
                          `👤 **Mpampiasa:** ${jobData.name}${jobData.username ? ` (@${jobData.username})` : ''}\n` +
                          `🆔 **ID:** ${jobData.userId}\n` +
                          `📝 **Description:** ${jobData.description}\n` +
                          `🔗 **Lien:** ${jobData.link}\n` +
                          `⏰ **Daty:** ${new Date().toLocaleString('mg-MG')}\n\n` +
                          `**Hamarinina ve ilay asa?**`;
        
        // 2. Alefa ny sary proofs miaraka amin'ny caption
        // Proof Site
        if (jobData.proofSite) {
            try {
                await bot.sendPhoto(ADMIN_ID, jobData.proofSite, {
                    caption: `🖼️ **PROOF 1: HISTORIQUE SITE**\nAvy amin'i: ${jobData.name}`
                });
            } catch (photoErr) {
                console.error("Tsy afaka nandefa proofSite:", photoErr);
                await bot.sendMessage(ADMIN_ID, `⚠️ **Tsy afaka nandefa sary Proof Site.**\nFile ID: ${jobData.proofSite?.substring(0, 20)}...`);
            }
        }
        
        // Proof Transaction
        if (jobData.proofTrans) {
            try {
                await bot.sendPhoto(ADMIN_ID, jobData.proofTrans, {
                    caption: `🖼️ **PROOF 2: HISTORIQUE PORTEFEUILLE**\nDescription: ${jobData.description}`
                });
            } catch (photoErr) {
                console.error("Tsy afaka nandefa proofTrans:", photoErr);
                await bot.sendMessage(ADMIN_ID, `⚠️ **Tsy afaka nandefa sary Proof Transaction.**\nFile ID: ${jobData.proofTrans?.substring(0, 20)}...`);
            }
        }
        
        // 3. Alefa ny hafatra farany misy bokitra fanekena
        const reviewMessage = await bot.sendMessage(ADMIN_ID, messageText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Manaiky', callback_data: `approve_${docId}_${jobData.userId}` },
                    { text: '❌ Mandà', callback_data: `reject_${docId}_${jobData.userId}` }
                ]]
            }
        });
        
        // Tehirizina ho an'ny fampahafantarana
        console.log(`✅ Review nalefa any amin'ny admin ho an'ny job ${docId}`);
        
    } catch (err) {
        console.error("❌ ERROR tamin'ny fandefasana review any amin'ny Admin:", err);
        
        // Andramana hafatra tsotra raha misy olana
        try {
            await bot.sendMessage(ADMIN_ID, `⚠️ **Misy asa vaovao nefa nisy olana:**\n\n` +
                `ID: ${docId}\n` +
                `User: ${jobData.name}\n` +
                `Desc: ${jobData.description}\n` +
                `Link: ${jobData.link}\n\n` +
                `**Jereo ao amin'ny Firestore ny sary proofs.**`);
        } catch (e) {
            console.error("Tsy afaka nandefa message fallback:", e);
        }
    }
}

// --- 7. SHOW JOBS (Approved) ---

async function handleShowJobs(chatId) {
    try {
        const q = query(collection(db, "jobs"), where("status", "==", "approved"));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            return bot.sendMessage(chatId, "📭 **Mbola tsy misy asa approved.**\nMiandrasa fankatoavana avy amin'ny admin.");
        }
        
        const jobs = [];
        snap.forEach(doc => {
            jobs.push({ id: doc.id, ...doc.data() });
        });
        
        // Filaharana ny asa vao haingana voalohany
        jobs.sort((a, b) => {
            const dateA = a.createdAt?.toDate() || new Date(0);
            const dateB = b.createdAt?.toDate() || new Date(0);
            return dateB - dateA;
        });
        
        // Hameren'ny asa 5 isa indray mandeha (mba tsy hanenjana)
        const jobsToShow = jobs.slice(0, 5);
        
        for (const job of jobsToShow) {
            const caption = `━━━━━━━━━━━━━━━━━━\n` +
                          `💼 **ASA: ${job.description.toUpperCase()}**\n` +
                          `━━━━━━━━━━━━━━━━━━\n` +
                          `✅ *Verified by Admin*\n\n` +
                          `👇 **Tsindrio ny bokitra raha te-handray:**`;
            
            const opts = {
                caption: caption,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🌐 HANDRAY NY ASA', url: job.link }
                    ]]
                }
            };
            
            try {
                if (job.mediaType === 'photo') {
                    await bot.sendPhoto(chatId, job.publicMedia, opts);
                } else if (job.mediaType === 'video') {
                    await bot.sendVideo(chatId, job.publicMedia, opts);
                } else if (job.mediaType === 'voice') {
                    await bot.sendVoice(chatId, job.publicMedia, opts);
                } else if (job.mediaType === 'doc') {
                    await bot.sendDocument(chatId, job.publicMedia, opts);
                } else {
                    await bot.sendMessage(chatId, caption, opts);
                }
            } catch (mediaErr) {
                console.error("Error sending media:", mediaErr);
                await bot.sendMessage(chatId, caption, opts);
            }
            
            // Miandry kely mba tsy hampangina ny bot
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
    } catch (e) {
        console.error("Error in handleShowJobs:", e);
        bot.sendMessage(chatId, "⚠️ **Misy olana nitranga tamin'ny fikarohana asa.** Andramo indray.");
    }
}

// --- 8. MY JOBS ---

async function handleMyJobs(chatId) {
    try {
        const q = query(collection(db, "jobs"), where("userId", "==", chatId));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            return bot.sendMessage(chatId, "📭 **Mbola tsy nandefa asa ianao.**\nTsindrio '📝 Hizara Asa' raha te-hanomboka.");
        }
        
        const jobs = [];
        snap.forEach(doc => {
            const job = doc.data();
            jobs.push({
                id: doc.id,
                ...job
            });
        });
        
        // Filaharana ny vao haingana voalohany
        jobs.sort((a, b) => {
            const dateA = a.createdAt?.toDate() || new Date(0);
            const dateB = b.createdAt?.toDate() || new Date(0);
            return dateB - dateA;
        });
        
        let message = "📊 **NY ASA NATOANAO:**\n\n";
        
        jobs.forEach((job, index) => {
            const date = job.createdAt?.toDate() || new Date();
            const formattedDate = date.toLocaleDateString('mg-MG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            let statusText = "";
            if (job.status === 'pending') {
                statusText = "⏳ **Miandry review**";
            } else if (job.status === 'approved') {
                statusText = "✅ **Neken'ny Admin**";
            } else if (job.status === 'rejected') {
                statusText = "❌ **Nolavin'ny Admin**";
            }
            
            message += `${index + 1}. **${job.description}**\n`;
            message += `   📅 ${formattedDate}\n`;
            message += `   ${statusText}\n`;
            message += `   🔗 ${job.link}\n\n`;
        });
        
        message += `\n**Total:** ${jobs.length} asa`;
        
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        
    } catch (e) {
        console.error("Error in handleMyJobs:", e);
        bot.sendMessage(chatId, "⚠️ **Misy olana nitranga.** Andramo indray.");
    }
}

// --- 9. COMMAND ADMIN ---

bot.onText(/\/admin/, (msg) => {
    if (msg.chat.id.toString() !== ADMIN_ID.toString()) {
        return bot.sendMessage(msg.chat.id, "⚠️ Tsy manan-kery.");
    }
    
    const adminMenu = {
        reply_markup: {
            keyboard: [
                [{ text: '📋 Jereo pending' }, { text: '📊 Statistika' }],
                [{ text: '🏠 Menu principal' }]
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(msg.chat.id, "👑 **Menu Admin**", adminMenu);
});

// --- 10. ERROR HANDLING ---

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

console.log('🤖 Bot miasa...');
