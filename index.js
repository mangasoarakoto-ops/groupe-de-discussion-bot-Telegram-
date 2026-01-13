const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, query, where, getDocs, doc, updateDoc, serverTimestamp, orderBy } = require("firebase/firestore");

// --- 1. CONFIGURATION ---
const token = '8525418474:AAHebHUTYrpKAq0Dr4UPPehYOYAacTMuYmA';
const ADMIN_ID = 8207051152; // OVAINA HO NOMBRE (tsisy guillemets)

const firebaseConfig = {
    apiKey: "AIzaSyDPrTWmxovZdbbi0BmXr6Tn6AyrlaO0cbM",
    authDomain: "bot-asa-en-ligne-mada.firebaseapp.com",
    projectId: "bot-asa-en-ligne-mada",
    storageBucket: "bot-asa-en-ligne-mada.firebasestorage.app",
    messagingSenderId: "837671675184",
    appId: "1:837671675184:web:2cd55ef7eacac7e33554f5"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const bot = new TelegramBot(token, { polling: true });

// Express Server (Keep-alive)
const app = express();
app.get('/', (req, res) => res.send('Bot is running...'));
app.listen(process.env.PORT || 3000);

// --- 2. VARIABLES & MENU ---
const userStates = {}; 

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
            bot.sendMessage(chatId, "📂 **Dingana 5/5 (Ho hita public)**\nAlefaso ny sary/video/vocal ho an'ny rehetra: ");
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
                    status: 'pending',
                    createdAt: serverTimestamp()
                });
                
                await sendReviewToAdmin(docRef.id, state, msg.from);
                bot.sendMessage(chatId, "✅ Voaray! Miandrasa fankatoavana avy amin'ny Admin.", mainKeyboard);
            } catch (e) {
                console.error(e);
                bot.sendMessage(chatId, "⚠️ Olana tamin'ny famonjena azy.");
            }
            delete userStates[chatId];
            break;
    }
}

// --- 5. ADMIN CALLBACKS ---

bot.on('callback_query', async (query) => {
    const data = query.data;
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const [action, docId, targetId] = data.split('_');
        const jobRef = doc(db, "jobs", docId);
        try {
            if (action === 'approve') {
                await updateDoc(jobRef, { status: "approved" });
                bot.sendMessage(targetId, "✅ **Neken'ny Admin ny asanao!** Efa hita public izao.");
            } else {
                await updateDoc(jobRef, { status: "rejected" });
                bot.sendMessage(targetId, "❌ **Nolavin'ny Admin ny asanao.**");
            }
            bot.deleteMessage(query.message.chat.id, query.message.message_id);
            bot.sendMessage(ADMIN_ID, `Asa ${action === 'approve' ? 'nekena' : 'nolavina'}.`);
        } catch (e) { console.error(e); }
    }
    if (data.startsWith('replyto_')) {
        const targetId = data.split('_')[1];
        userStates[ADMIN_ID] = { step: 'ADMIN_SENDING_REPLY', targetId: targetId };
        bot.sendMessage(ADMIN_ID, `Manorata valiny ho an'i ${targetId}:`);
    }
    bot.answerCallbackQuery(query.id);
});

// --- 6. HELPERS ---

async function sendReviewToAdmin(docId, data, user) {
    try {
        await bot.sendPhoto(ADMIN_ID, data.proofSite, { caption: `🖼️ **PROOF 1: SITE**\nAvy amin'i: ${user.first_name}` });
        await bot.sendPhoto(ADMIN_ID, data.proofTrans, { caption: `🖼️ **PROOF 2: TRANSACTION**\nDescription: ${data.description}` });
        
        await bot.sendMessage(ADMIN_ID, `🆕 **ASA VAOVAO HOHAMARININA**\n🔗 Lien: ${data.link}`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Manaiky', callback_data: `approve_${docId}_${user.id}` },
                    { text: '❌ Mandà', callback_data: `reject_${docId}_${user.id}` }
                ]]
            }
        });
    } catch (err) {
        console.error("Tsy lasa any amin'ny Admin ny hafatra:", err);
        bot.sendMessage(ADMIN_ID, `⚠️ Misy nanandrana nandefa asa nefa nisy fahadisoana tamin'ny sary.\nID: ${docId}`);
    }
}

async function handleShowJobs(chatId) {
    try {
        const q = query(collection(db, "jobs"), where("status", "==", "approved"));
        const snap = await getDocs(q);
        if (snap.empty) return bot.sendMessage(chatId, "📭 Mbola tsy misy asa approved.");

        snap.forEach(doc => {
            const job = doc.data();
            const caption = `━━━━━━━━━━━━━━━━━━\n💼 **ASA: ${job.description.toUpperCase()}**\n━━━━━━━━━━━━━━━━━━\n✅ *Verified by Admin*\n\n👇 **Tsindrio ny bokitra:**`;
            const opts = {
                caption: caption,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '🌐 HANDRAY NY ASA', url: job.link }]] }
            };

            if (job.mediaType === 'photo') bot.sendPhoto(chatId, job.publicMedia, opts);
            else if (job.mediaType === 'video') bot.sendVideo(chatId, job.publicMedia, opts);
            else if (job.mediaType === 'voice') bot.sendVoice(chatId, job.publicMedia, opts);
            else bot.sendMessage(chatId, caption, opts);
        });
    } catch (e) { console.error(e); }
}

// --- 7. NOUVELLE FONCTIONNALITÉ: HISTORIQUE DES ASA ---

async function handleMyJobs(chatId) {
    try {
        const q = query(collection(db, "jobs"), where("userId", "==", chatId));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            return bot.sendMessage(chatId, "📭 Mbola tsy nandefa asa ianao.");
        }

        let jobs = [];
        snap.forEach(doc => {
            const job = doc.data();
            job.id = doc.id;
            jobs.push(job);
        });

        // Trier par date décroissante
        jobs.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA;
        });

        let message = "📊 **Ny asa nataonao:**\n\n";
        jobs.forEach((job, index) => {
            const date = job.createdAt ? job.createdAt.toDate() : new Date();
            const formattedDate = date.toLocaleDateString('mg-MG', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            let statusEmoji = '⏳';
            if (job.status === 'approved') statusEmoji = '✅';
            else if (job.status === 'rejected') statusEmoji = '❌';
            
            message += `${index+1}. **${job.description}**\n`;
            message += `   ⏰ ${formattedDate}\n`;
            message += `   Statut: ${statusEmoji} ${job.status}\n\n`;
        });

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, "⚠️ Misy olana nitranga.");
    }
}
