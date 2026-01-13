const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc, deleteDoc } = require("firebase/firestore");

// --- 1. CONFIGURATION ---
const token = process.env.TELEGRAM_BOT_TOKEN || '8525418474:AAHebHUTYrpKAq0Dr4UPPehYOYAacTMuYmA';

// TOMPOKO, OVAY ITY REHEFA AVY MANAO /id IANAO
// Raha tsy azonao antoka, dia aza mampiasa process.env aloha, soraty mivantana ny isa.
const ADMIN_ID = 8207051152; // <--- SORATY ETO NY TENA ID-NAO REHEFA AVY MANAO /id

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

const app = express();
app.get('/', (req, res) => res.send('Bot is active.'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

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

// --- FANAMBOARANA : Hahafantarana ny ID ---
bot.onText(/\/id/, (msg) => {
    bot.sendMessage(msg.chat.id, `🆔 Ny ID-nao dia: \`${msg.chat.id}\`\n\nAlao io isa io dia apetraho ao amin'ny code eo amin'ny ADMIN_ID.`, { parse_mode: 'Markdown' });
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (msg.chat.type !== 'private') return;

    // Aza mi-traiter message raha commande /id
    if (text === '/id') return;

    if (text === '/start') {
        delete userStates[chatId];
        if (chatId.toString() === ADMIN_ID.toString()) {
            bot.sendMessage(chatId, `👑 **Tongasoa Admin!**\nVonona handray notifications ianao.\nID-nao: ${chatId}`, mainKeyboard);
        } else {
            bot.sendMessage(chatId, `👋 **Salama ${msg.from.first_name}!**\nAfaka mandefa asa ianao ato.`, mainKeyboard);
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
        bot.sendMessage(chatId, "💬 Manorata ny hafatra:", { reply_markup: { keyboard: [[{text: '❌ Hanafoana'}]], resize_keyboard: true } });
    }
    else if (text === '📊 Ny asa nataoko') {
        handleMyJobs(chatId);
    }
});

async function handleSteps(chatId, msg) {
    const state = userStates[chatId];
    const text = msg.text;

    if (state.step === 'WAITING_FOR_ADMIN_MSG' || state.step === 'ADMIN_SENDING_REPLY') {
        if (text === '❌ Hanafoana') {
            delete userStates[chatId];
            return bot.sendMessage(chatId, "Nofononina.", mainKeyboard);
        }
        if (state.step === 'ADMIN_SENDING_REPLY') {
            bot.sendMessage(state.targetId, `📩 **Admin:**\n${text}`);
            bot.sendMessage(chatId, "✅ Lasa.", mainKeyboard);
        } else {
            bot.sendMessage(ADMIN_ID, `📩 **User ${msg.from.first_name}:**\n${text}`, {
                reply_markup: { inline_keyboard: [[{ text: '💬 Hamaly', callback_data: `replyto_${chatId}` }]] }
            });
            bot.sendMessage(chatId, "✅ Lasa any amin'ny admin.", mainKeyboard);
        }
        delete userStates[chatId];
        return;
    }

    switch (state.step) {
        case 'ASK_DESC':
            state.description = text;
            state.step = 'ASK_LINK';
            bot.sendMessage(chatId, "🔗 **Dingana 2/5**\nAlefaso ny **LIEN**:");
            break;
        case 'ASK_LINK':
            state.link = text;
            state.step = 'ASK_PROOF_SITE';
            bot.sendMessage(chatId, "📸 **Dingana 3/5**\nAlefaso ny **SARY 1** (Historique Site):");
            break;
        case 'ASK_PROOF_SITE':
            if (!msg.photo) return bot.sendMessage(chatId, "⚠️ Sary azafady.");
            state.proofSite = msg.photo[msg.photo.length - 1].file_id;
            state.step = 'ASK_PROOF_TRANS';
            bot.sendMessage(chatId, "📸 **Dingana 4/5**\nAlefaso ny **SARY 2** (Portefeuille):");
            break;
        case 'ASK_PROOF_TRANS':
            if (!msg.photo) return bot.sendMessage(chatId, "⚠️ Sary azafady.");
            state.proofTrans = msg.photo[msg.photo.length - 1].file_id;
            state.step = 'ASK_PUBLIC_MEDIA';
            bot.sendMessage(chatId, "📂 **Dingana 5/5**\nAlefaso ny sary/video **ho an'ny public**:");
            break;
        case 'ASK_PUBLIC_MEDIA':
            const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : 
                           (msg.video ? msg.video.file_id : 
                           (msg.document ? msg.document.file_id : null));
            
            if (!fileId) return bot.sendMessage(chatId, "⚠️ Sary na Video azafady.");
            
            state.publicMedia = fileId;
            state.mediaType = msg.photo ? 'photo' : (msg.video ? 'video' : 'doc');

            bot.sendMessage(chatId, "⏳ **Mandefa any amin'ny Admin...**");

            try {
                const jobData = {
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
                };
                
                const docRef = await addDoc(collection(db, "jobs"), jobData);
                
                // MANANDRANA MANDEFA ANY AMIN'NY ADMIN
                try {
                     await sendReviewToAdmin(docRef.id, jobData);
                     bot.sendMessage(chatId, "✅ **Tonga any amin'ny Admin!** Miandry valiny sisa.", mainKeyboard);
                } catch (adminErr) {
                     console.error("ADMIN ERROR:", adminErr);
                     bot.sendMessage(chatId, "⚠️ Voatahiry ny asa fa **tsy tafiditra any amin'ny Admin**. Hamarino raha nanao /start ny Admin.", mainKeyboard);
                }

            } catch (e) {
                console.error("DB Error:", e);
                bot.sendMessage(chatId, "⚠️ Error DB.", mainKeyboard);
            }
            delete userStates[chatId];
            break;
    }
}

// --- ADMIN NOTIFICATION FUNCTION (Robust) ---
async function sendReviewToAdmin(docId, jobData) {
    console.log("--> Mandefa review any amin'ny ID:", ADMIN_ID);

    const message = `🆕 **ASA VAOVAO**\n👤 ${jobData.name}\n📝 ${jobData.description}\n🔗 ${jobData.link}`;
    
    // Alefa ny sary porofo (ignore error raha tsy mety ny sary)
    if (jobData.proofSite) await bot.sendPhoto(ADMIN_ID, jobData.proofSite).catch(e => console.log("Sary 1 error:", e.message));
    if (jobData.proofTrans) await bot.sendPhoto(ADMIN_ID, jobData.proofTrans).catch(e => console.log("Sary 2 error:", e.message));

    // Alefa ny fanapahan-kevitra (Tsy maintsy tonga ity)
    await bot.sendMessage(ADMIN_ID, message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Ekena', callback_data: `approve_${docId}_${jobData.userId}` }],
                [{ text: '❌ Nolavina', callback_data: `reject_${docId}_${jobData.userId}` }]
            ]
        }
    });
}

// --- CALLBACKS (Approve/Reject/Delete) ---
bot.on('callback_query', async (query) => {
    const data = query.data;
    const msgId = query.message.message_id;
    const chatId = query.message.chat.id;

    if (data.startsWith('delete_')) {
        const docId = data.split('_')[1];
        await deleteDoc(doc(db, "jobs", docId));
        await bot.deleteMessage(chatId, msgId);
        bot.answerCallbackQuery(query.id, { text: "Voafafa!" });
    }
    
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const [action, docId, targetId] = data.split('_');
        const status = action === 'approve' ? 'approved' : 'rejected';
        
        await updateDoc(doc(db, "jobs", docId), { status: status });
        
        const txt = action === 'approve' ? "✅ NEKENA" : "❌ NOLAVINA";
        bot.editMessageText(`${txt}\nJob ID: ${docId}`, { chat_id: chatId, message_id: msgId });
        
        bot.sendMessage(targetId, `Ny asanao dia: **${txt}**`);
    }
    
    if (data.startsWith('replyto_')) {
        const targetId = data.split('_')[1];
        userStates[ADMIN_ID] = { step: 'ADMIN_SENDING_REPLY', targetId: targetId };
        bot.sendMessage(ADMIN_ID, "Soraty ny valiny:");
    }
});

// --- SHOW JOBS ---
async function handleShowJobs(chatId) {
    const snap = await getDocs(query(collection(db, "jobs"), where("status", "==", "approved")));
    if (snap.empty) return bot.sendMessage(chatId, "📭 Tsy misy asa.");
    
    snap.forEach(doc => {
        const job = doc.data();
        const opts = {
            caption: `💼 **${job.description}**\n🔗 ${job.link}`,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: 'HANDRAY', url: job.link }]] }
        };
        if (job.mediaType === 'photo') bot.sendPhoto(chatId, job.publicMedia, opts).catch(() => bot.sendMessage(chatId, opts.caption));
        else bot.sendMessage(chatId, opts.caption);
    });
}

async function handleMyJobs(chatId) {
    const snap = await getDocs(query(collection(db, "jobs"), where("userId", "==", chatId)));
    if (snap.empty) return bot.sendMessage(chatId, "📭 Tsy misy asa nalefanao.");
    
    snap.forEach(doc => {
        const job = doc.data();
        let icon = job.status === 'approved' ? '✅' : (job.status === 'rejected' ? '❌' : '⏳');
        bot.sendMessage(chatId, `${icon} ${job.description}`, {
            reply_markup: { inline_keyboard: [[{ text: '🗑️ Hamafa', callback_data: `delete_${doc.id}` }]] }
        });
    });
}
