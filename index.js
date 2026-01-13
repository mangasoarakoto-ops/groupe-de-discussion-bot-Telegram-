const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, query, where, getDocs, doc, updateDoc, serverTimestamp, orderBy } = require("firebase/firestore");

// --- 1. CONFIGURATION ---
const token = process.env.TELEGRAM_TOKEN || '8525418474:AAHebHUTYrpKAq0Dr4UPPehYOYAacTMuYmA';
const ADMIN_ID = process.env.ADMIN_ID || '8207051152'; 

const firebaseConfig = {
    apiKey: "AIzaSyDPrTWmxovZdbbi0BmXr6Tn6AyrlaO0cbM",
    authDomain: "bot-asa-en-ligne-mada.firebaseapp.com",
    projectId: "bot-asa-en-ligne-mada",
    storageBucket: "bot-asa-en-ligne-mada.firebasestorage.app",
    messagingSenderId: "837671675184",
    appId: "1:837671675184:web:2cd55ef7eacac7e33554f5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const bot = new TelegramBot(token, { polling: true });

const appServer = express();
appServer.get('/', (req, res) => res.send('Bot Asa En Ligne ACTIVE!'));
appServer.listen(process.env.PORT || 3000);

// --- 2. VARIABLES & MENU ---
const userStates = {}; 

const mainKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: '🔍 Hijery Asa' }, { text: '📝 Hizara Asa' }],
            [{ text: '🔄 Actualiser' }, { text: '📞 Admin' }]
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
        return bot.sendMessage(chatId, `👋 **Salama ${msg.from.first_name}!**\nAmpiasao ny bokitra ambany hitetezana ny bot.`, mainKeyboard);
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
        bot.sendMessage(chatId, "💬 Manorata ny hafatra halefa any amin'ny Admin:", { 
            reply_markup: { keyboard: [[{text: '❌ Hanafoana'}]], resize_keyboard: true } 
        });
    }
});

// --- 4. HANDLING STEPS ---

async function handleSteps(chatId, msg) {
    const state = userStates[chatId];
    const text = msg.text;

    // CHAT SYSTEM
    if (state.step === 'WAITING_FOR_ADMIN_MSG' || state.step === 'ADMIN_SENDING_REPLY') {
        if (text === '❌ Hanafoana') {
            delete userStates[chatId];
            return bot.sendMessage(chatId, "Nofononina.", mainKeyboard);
        }
        
        if (state.step === 'ADMIN_SENDING_REPLY') {
            bot.sendMessage(state.targetId, `📩 **Valiny avy amin'ny Admin:**\n\n${text}`, {
                reply_markup: { inline_keyboard: [[{ text: '💬 Hamaly an\'i Admin', callback_data: `replyto_${ADMIN_ID}` }]] }
            });
            bot.sendMessage(chatId, "✅ Nalefa ny valiny.");
        } else {
            bot.sendMessage(ADMIN_ID, `📩 **Hafatra avy amin'i ${msg.from.first_name}**:\n\n${text}`, {
                reply_markup: { inline_keyboard: [[{ text: '💬 Hamaly azy', callback_data: `replyto_${chatId}` }]] }
            });
            bot.sendMessage(chatId, "✅ Nalefa ny hafatry ny Admin.", mainKeyboard);
        }
        delete userStates[chatId];
        return;
    }

    // JOB POSTING
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
            bot.sendMessage(chatId, "📸 **Dingana 3/5**\nSary **Historique Site**: ");
            break;
        case 'ASK_PROOF_SITE':
            if (!msg.photo) return bot.sendMessage(chatId, "⚠️ Sary azafady.");
            state.proofSite = msg.photo[msg.photo.length - 1].file_id;
            state.step = 'ASK_PROOF_TRANS';
            bot.sendMessage(chatId, "📸 **Dingana 4/5**\nSary **Historique Portefeuille**: ");
            break;
        case 'ASK_PROOF_TRANS':
            if (!msg.photo) return bot.sendMessage(chatId, "⚠️ Sary azafady.");
            state.proofTrans = msg.photo[msg.photo.length - 1].file_id;
            state.step = 'ASK_PUBLIC_MEDIA';
            bot.sendMessage(chatId, "📂 **Dingana 5/5 (Public)**\nAlefaso ny sary/video/vocal ho hitan'ny olona: ");
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
                const docRef = await addDoc(collection(db, "jobs"), {
                    userId: chatId,
                    name: msg.from.first_name,
                    description: state.description,
                    link: state.link,
                    proofSite: state.proofSite,
                    proofTrans: state.proofTrans,
                    publicMedia: state.publicMedia,
                    mediaType: state.mediaType,
                    status: 'pending', // MIANDRY ADMIN
                    createdAt: serverTimestamp()
                });
                sendReviewToAdmin(docRef.id, state, msg.from);
                bot.sendMessage(chatId, "✅ Voaray! Miandrasa fankatoavana avy amin'ny Admin.", mainKeyboard);
            } catch (e) { console.error("Database Error:", e); }
            delete userStates[chatId];
            break;
    }
}

// --- 5. ADMIN CALLBACKS (APPROVE/REJECT) ---

bot.on('callback_query', async (query) => {
    const data = query.data;
    const adminChatId = query.message.chat.id;

    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const [action, docId, targetId] = data.split('_');
        const jobRef = doc(db, "jobs", docId);

        try {
            if (action === 'approve') {
                // MIASA ETO: Ovaina ho 'approved' ilay status
                await updateDoc(jobRef, { status: "approved" });
                bot.sendMessage(targetId, "✅ **Neken'ny Admin ny asanao!** Efa hita public izao.");
                bot.sendMessage(adminChatId, "✅ Asa nekena.");
            } else {
                await updateDoc(jobRef, { status: "rejected" });
                bot.sendMessage(targetId, "❌ **Nolavin'ny Admin ny asanao.**");
                bot.sendMessage(adminChatId, "❌ Asa nolavina.");
            }
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: adminChatId, message_id: query.message.message_id });
        } catch (e) {
            console.error("Update error:", e);
            bot.sendMessage(adminChatId, "⚠️ Error tamin'ny fanekena.");
        }
    }

    if (data.startsWith('replyto_')) {
        const targetId = data.split('_')[1];
        userStates[adminChatId] = { step: 'ADMIN_SENDING_REPLY', targetId: targetId };
        bot.sendMessage(adminChatId, `Mandrefasa valiny ho an'i ${targetId}:`);
    }
    bot.answerCallbackQuery(query.id);
});

// --- 6. HELPERS ---

async function sendReviewToAdmin(docId, data, user) {
    await bot.sendPhoto(ADMIN_ID, data.proofSite, { caption: `🖼️ **PROOF 1 (Site)**\nAvy amin'i: ${user.first_name}` });
    await bot.sendPhoto(ADMIN_ID, data.proofTrans, { caption: `🖼️ **PROOF 2 (Portefeuille)**\nDesc: ${data.description}` });
    
    bot.sendMessage(ADMIN_ID, `🆕 **ASA VAOVAO**\n🔗 Link: ${data.link}`, {
        reply_markup: {
            inline_keyboard: [[
                { text: '✅ Manaiky', callback_data: `approve_${docId}_${user.id}` },
                { text: '❌ Mandà', callback_data: `reject_${docId}_${user.id}` }
            ]]
        }
    });
}

async function handleShowJobs(chatId) {
    try {
        const jobsRef = collection(db, "jobs");
        // MAZAVA: Ny 'status' dia tsy maintsy 'approved'
        const q = query(jobsRef, where("status", "==", "approved"));
        const snap = await getDocs(q);

        if (snap.empty) {
            return bot.sendMessage(chatId, "📭 Mbola tsy misy asa neken'ny Admin (approved) aloha izao.", mainKeyboard);
        }

        bot.sendMessage(chatId, "✨ **IRETO NY ASA AZO ALAFY:**");

        snap.forEach((doc) => {
            const job = doc.data();
            const caption = `
━━━━━━━━━━━━━━━━━━
💼 **ASA: ${job.description.toUpperCase()}**
━━━━━━━━━━━━━━━━━━
✅ *Verified by Admin*
📅 *Daty:* ${new Date().toLocaleDateString('fr-FR')}

👇 **Tsindrio ny bokitra ambany raha hanao ny asa:**`;

            const opts = {
                caption: caption,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '🌐 HANDRAY NY ASA (LINK)', url: job.link }]]
                }
            };

            if (job.mediaType === 'photo') bot.sendPhoto(chatId, job.publicMedia, opts);
            else if (job.mediaType === 'video') bot.sendVideo(chatId, job.publicMedia, opts);
            else if (job.mediaType === 'voice') bot.sendVoice(chatId, job.publicMedia, opts);
            else bot.sendMessage(chatId, caption, opts);
        });
    } catch (e) {
        console.error("Fetch error:", e);
        bot.sendMessage(chatId, "⚠️ Misy olana teknika.");
    }
}
