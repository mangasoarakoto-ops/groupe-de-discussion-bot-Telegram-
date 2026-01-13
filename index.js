const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
// Nampiana deleteDoc eto
const { getFirestore, collection, addDoc, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc, deleteDoc } = require("firebase/firestore");

// --- 1. CONFIGURATION ---
const token = process.env.TELEGRAM_BOT_TOKEN || '8525418474:AAHebHUTYrpKAq0Dr4UPPehYOYAacTMuYmA';
// HAMARINO TSARA ITY ID ITY. Ataovy azo antoka fa efa nanao /start tao amin'ny bot io olona io.
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
const pendingJobs = {};

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
        // Logika kely hijerena raha Admin ilay manao start
        if (chatId === ADMIN_ID) {
            bot.sendMessage(chatId, `👑 **Tongasoa Admin!**\nVonona handray notifications ianao.`, mainKeyboard);
        } else {
            bot.sendMessage(chatId, `👋 **Salama ${msg.from.first_name}!**\nAfaka mandefa asa ianao ato. Ampiasao ny bokitra ambany.`, mainKeyboard);
        }
        return;
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
            try {
                await bot.sendMessage(state.targetId, `📩 **Valiny avy amin'ny Admin:**\n\n${text}`);
                bot.sendMessage(chatId, "✅ Nalefa ny valiny.", mainKeyboard);
            } catch (e) {
                bot.sendMessage(chatId, "❌ Tsy lasa ny hafatra. Mety nanao block ny bot ilay olona.", mainKeyboard);
            }
        } else {
            try {
                await bot.sendMessage(ADMIN_ID, `📩 **Hafatra avy amin'i ${msg.from.first_name} (ID: ${chatId}):**\n\n${text}`, {
                    reply_markup: { inline_keyboard: [[{ text: '💬 Hamaly azy', callback_data: `replyto_${chatId}` }]] }
                });
                bot.sendMessage(chatId, "✅ Nalefa ny hafatra.", mainKeyboard);
            } catch (e) {
                console.error("Error sending to admin:", e);
                bot.sendMessage(chatId, "⚠️ Misy olana ny fifandraisana amin'ny Admin amin'izao fotoana.", mainKeyboard);
            }
        }
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
            if (!text || !text.startsWith('http')) return bot.sendMessage(chatId, "⚠️ Lien diso. Avereno (ataovy misy http na https):");
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
                
                // ZAVA-DEHIBE: Alefa any amin'ny admin
                await sendReviewToAdmin(docRef.id, jobData);
                
                bot.sendMessage(chatId, "✅ Voaray ny asanao! **Miandry fankatoavana avy amin'ny Admin** izao.", mainKeyboard);
                
            } catch (e) {
                console.error("Error saving job:", e);
                bot.sendMessage(chatId, "⚠️ Nisy olana tamin'ny fametrahana asa. Andramo indray.");
            }
            delete userStates[chatId];
            break;
    }
}

// --- 5. ADMIN CALLBACKS & DELETE ---

bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    
    // ACTION DELETE (Hamafa asa)
    if (data.startsWith('delete_')) {
        const docId = data.split('_')[1];
        try {
            // Hamafana ny hafatra misy ilay bokitra
            await bot.deleteMessage(chatId, query.message.message_id);
            
            // Hamafana ao amin'ny Firestore
            await deleteDoc(doc(db, "jobs", docId));
            
            bot.answerCallbackQuery(query.id, { text: "✅ Voafafa soa aman-tsara ny asa!" });
        } catch (e) {
            console.error("Error deleting job:", e);
            bot.answerCallbackQuery(query.id, { text: "❌ Tsy nahomby ny famafana." });
        }
        return;
    }
    
    // APPROVE na REJECT
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const [action, docId, targetId] = data.split('_');
        const jobRef = doc(db, "jobs", docId);
        
        try {
            const jobSnap = await getDoc(jobRef);
            if (!jobSnap.exists()) {
                return bot.answerCallbackQuery(query.id, { text: "❌ Efa tsy misy io asa io!" });
            }
            
            const jobData = jobSnap.data();
            
            if (action === 'approve') {
                await updateDoc(jobRef, { 
                    status: "approved",
                    approvedAt: serverTimestamp()
                });
                
                bot.sendMessage(targetId, `🎉 **NEEKEN'NY ADMIN NY ASA NAO!**\n\n📝 ${jobData.description}\n✅ Efa hita ao amin'ny lisitra izao.`);
                bot.editMessageCaption(`✅ **NEKENA**\n${jobData.description}`, { chat_id: chatId, message_id: query.message.message_id });
                
            } else {
                await updateDoc(jobRef, { 
                    status: "rejected",
                    rejectedAt: serverTimestamp()
                });
                
                bot.sendMessage(targetId, `❌ **NOLAVIN'NY ADMIN NY ASA NAO.**\n\n📝 ${jobData.description}\n⚠️ Avereno jerena ny fitsipika.`);
                bot.editMessageCaption(`❌ **NOLAVINA**\n${jobData.description}`, { chat_id: chatId, message_id: query.message.message_id });
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

// --- 6. SEND REVIEW TO ADMIN (NOVAINA KELY) ---

async function sendReviewToAdmin(docId, jobData) {
    console.log(`Manandrana mandefa any amin'ny Admin ID: ${ADMIN_ID}`);
    try {
        const messageText = `🆕 **ASA VAOVAO HOHAMARININA**\n\n` +
                          `👤 **Mpampiasa:** ${jobData.name}\n` +
                          `📝 **Description:** ${jobData.description}\n` +
                          `🔗 **Lien:** ${jobData.link}\n\n` +
                          `👇 **Jereo ny porofo etsy ambany ary valio:**`;
        
        // Alefa ny porofo (Sary 1)
        if (jobData.proofSite) {
            await bot.sendPhoto(ADMIN_ID, jobData.proofSite, { caption: '🖼️ Proof Site' }).catch(e => console.log("Tsy lasa sary 1"));
        }
        // Alefa ny porofo (Sary 2)
        if (jobData.proofTrans) {
            await bot.sendPhoto(ADMIN_ID, jobData.proofTrans, { caption: '🖼️ Proof Transaction' }).catch(e => console.log("Tsy lasa sary 2"));
        }

        // Alefa ny bokitra fanapahan-kevitra
        await bot.sendMessage(ADMIN_ID, messageText, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Manaiky', callback_data: `approve_${docId}_${jobData.userId}` },
                    { text: '❌ Mandà', callback_data: `reject_${docId}_${jobData.userId}` }
                ]]
            }
        });
        
    } catch (err) {
        console.error("❌ ERROR tamin'ny fandefasana review any amin'ny Admin:", err.message);
        // Raha tsy mety mandefa amin'ny Admin dia farafaharatsiny logina
        console.log("Check if Admin has blocked the bot or ID is wrong.");
    }
}

// --- 7. SHOW JOBS (Approved Only) ---

async function handleShowJobs(chatId) {
    try {
        const q = query(collection(db, "jobs"), where("status", "==", "approved"));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            return bot.sendMessage(chatId, "📭 **Mbola tsy misy asa vaovao.**\nMiverena afaka fotoana fohy.");
        }
        
        const jobs = [];
        snap.forEach(doc => jobs.push({ id: doc.id, ...doc.data() }));
        
        // Rihana avy amin'ny vaovao indrindra
        jobs.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
        
        const jobsToShow = jobs.slice(0, 5);
        
        for (const job of jobsToShow) {
            const caption = `💼 **${job.description.toUpperCase()}**\n\n` +
                          `✅ *Verified*\n` +
                          `👤 Nalefan'i: ${job.name}\n` +
                          `🔗 Tsindrio ambany raha handray anjara:`;
            
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
                if (job.mediaType === 'photo') await bot.sendPhoto(chatId, job.publicMedia, opts);
                else if (job.mediaType === 'video') await bot.sendVideo(chatId, job.publicMedia, opts);
                else await bot.sendMessage(chatId, caption, opts);
            } catch (mediaErr) {
                await bot.sendMessage(chatId, caption, opts); // Fallback raha tsy mety sary
            }
            await new Promise(r => setTimeout(r, 200));
        }
        
    } catch (e) {
        console.error("Error showing jobs:", e);
        bot.sendMessage(chatId, "⚠️ Nisy olana kely.");
    }
}

// --- 8. MY JOBS (Misy bokitra Delete) ---

async function handleMyJobs(chatId) {
    try {
        const q = query(collection(db, "jobs"), where("userId", "==", chatId));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            return bot.sendMessage(chatId, "📭 **Mbola tsy nandefa asa ianao.**");
        }
        
        const jobs = [];
        snap.forEach(doc => jobs.push({ id: doc.id, ...doc.data() }));
        jobs.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));

        bot.sendMessage(chatId, "📊 **RETO NY ASA NALEFANAO:**\n(Tsindrio ny Hamafa raha te hanala azy)");

        for (const job of jobs) {
            const date = job.createdAt?.toDate().toLocaleDateString('mg-MG') || 'N/A';
            let statusIcon = "⏳"; // Pending
            if (job.status === 'approved') statusIcon = "✅";
            if (job.status === 'rejected') statusIcon = "❌";

            const message = `${statusIcon} **${job.description}**\n📅 ${date}\n🔗 ${job.link}`;

            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🗑️ Hamafa ity asa ity', callback_data: `delete_${job.id}` }
                    ]]
                }
            });
        }
        
    } catch (e) {
        console.error("Error in handleMyJobs:", e);
        bot.sendMessage(chatId, "⚠️ Nisy olana.");
    }
}

// --- 9. COMMAND ADMIN (Check ID) ---

bot.onText(/\/admin/, (msg) => {
    if (msg.chat.id.toString() !== ADMIN_ID.toString()) {
        return bot.sendMessage(msg.chat.id, `⚠️ Tsy Admin ianao.\nNy ID-nao dia: ${msg.chat.id}`);
    }
    bot.sendMessage(msg.chat.id, "👑 **Admin Panel Active**");
});
