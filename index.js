const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, query, where, getDocs, doc, updateDoc, serverTimestamp } = require("firebase/firestore");

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

// --- 2. SERVER EXPRESS ---
const appServer = express();
appServer.get('/', (req, res) => res.send('Bot ACTIVE!'));
appServer.listen(process.env.PORT || 3000);

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
        return bot.sendMessage(chatId, `👋 **Salama ${msg.from.first_name}!**\nAfaka mandefa sary, video, audio, pdf, na **vocal** ianao izao rehefa mizara asa.`, mainKeyboard);
    }

    if (userStates[chatId]) {
        return handleAllSteps(chatId, msg);
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
        bot.sendMessage(chatId, "💬 Manorata ny hafatra tianao halefa any amin'ny Admin:", { reply_markup: { keyboard: [[{text: '❌ Hanafoana'}]], resize_keyboard: true } });
    }
});

// --- 4. FUNCTION HITANTANA NY DINGANA (Nampiana Vocal) ---

async function handleAllSteps(chatId, msg) {
    const state = userStates[chatId];
    const text = msg.text;

    // CHAT ADMIN
    if (state.step === 'WAITING_FOR_ADMIN_MSG') {
        if (text === '❌ Hanafoana') {
            delete userStates[chatId];
            return bot.sendMessage(chatId, "Nofononina ny fandefasana hafatra.", mainKeyboard);
        }
        bot.sendMessage(ADMIN_ID, `📩 **Hafatra avy amin'i ${msg.from.first_name}** (ID: \`${chatId}\`):\n\n${text}`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '💬 Hamaly azy', callback_data: `replyto_${chatId}` }]] }
        });
        bot.sendMessage(chatId, "✅ Nalefa ny hafatry ny Admin.", mainKeyboard);
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
            if (!text || !text.startsWith('http')) return bot.sendMessage(chatId, "⚠️ Diso ny lien. Avereno:");
            state.link = text;
            state.step = 'ASK_PROOF_SITE';
            bot.sendMessage(chatId, "📸 **Dingana 3/5 (Admin ihany)**\nAlefaso sary misy **Historique amin'ilay Site**: ");
            break;

        case 'ASK_PROOF_SITE':
            if (!msg.photo) return bot.sendMessage(chatId, "⚠️ Mila sary azafady.");
            state.proofSite = msg.photo[msg.photo.length - 1].file_id;
            state.step = 'ASK_PROOF_TRANS';
            bot.sendMessage(chatId, "📸 **Dingana 4/5 (Admin ihany)**\nAlefaso sary misy **Historique Transaction**:");
            break;

        case 'ASK_PROOF_TRANS':
            if (!msg.photo) return bot.sendMessage(chatId, "⚠️ Mila sary azafady.");
            state.proofTrans = msg.photo[msg.photo.length - 1].file_id;
            state.step = 'ASK_PUBLIC_MEDIA';
            bot.sendMessage(chatId, "📁 **Dingana 5/5 (Public)**\nAlefaso ny sary, video, audio, vocal na PDF: ");
            break;

        case 'ASK_PUBLIC_MEDIA':
            // Eto no nampiana ny 'voice'
            const fileId = msg.photo ? msg.photo[msg.photo.length - 1].file_id : 
                           (msg.video ? msg.video.file_id : 
                           (msg.audio ? msg.audio.file_id : 
                           (msg.voice ? msg.voice.file_id : // <-- Vocal
                           (msg.document ? msg.document.file_id : null))));

            if (!fileId) return bot.sendMessage(chatId, "⚠️ Alefaso fichier (Sary/Video/Vocal/PDF) azafady.");
            
            state.publicMedia = fileId;
            state.mediaType = msg.photo ? 'photo' : (msg.video ? 'video' : (msg.audio ? 'audio' : (msg.voice ? 'voice' : 'doc')));

            bot.sendMessage(chatId, "✅ **Voaray!** Miandrasa ny fankatoavan'ny Admin.", mainKeyboard);
            
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
                    timestamp: serverTimestamp()
                });
                sendJobToAdmin(docRef.id, state, msg.from);
            } catch (e) { console.log(e); }
            delete userStates[chatId];
            break;
    }
}

// --- 5. ADMIN HANDLERS ---

bot.on('callback_query', async (query) => {
    const data = query.data;
    const adminChatId = query.message.chat.id;

    if (data.startsWith('replyto_')) {
        const targetId = data.split('_')[1];
        userStates[adminChatId] = { step: 'ADMIN_SENDING_REPLY', targetId: targetId };
        bot.sendMessage(adminChatId, `Manorata ny valiny ho an'i User \`${targetId}\`:`, { parse_mode: 'Markdown' });
    }

    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const [action, docId, targetId] = data.split('_');
        const jobRef = doc(db, "jobs", docId);
        if (action === 'approve') {
            await updateDoc(jobRef, { status: 'approved' });
            bot.sendMessage(targetId, "✅ Neken'ny Admin ny asanao!");
        } else {
            await updateDoc(jobRef, { status: 'rejected' });
            bot.sendMessage(targetId, "❌ Nolavin'ny Admin ny asanao.");
        }
        bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: adminChatId, message_id: query.message.message_id });
    }
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (userStates[chatId]?.step === 'ADMIN_SENDING_REPLY') {
        const targetId = userStates[chatId].targetId;
        bot.sendMessage(targetId, `📩 **Valiny avy amin'ny Admin:**\n\n${msg.text}`, {
            reply_markup: { inline_keyboard: [[{ text: '💬 Valiana indray', callback_data: `replyto_${ADMIN_ID}` }]] }
        });
        bot.sendMessage(chatId, "✅ Nalefa ny valiny.");
        delete userStates[chatId];
    }
});

// --- 6. HELPERS (Nampiana Fomba fandefasana Vocal) ---

async function sendJobToAdmin(docId, data, user) {
    await bot.sendPhoto(ADMIN_ID, data.proofSite, { caption: "🖼️ Proof 1: Site" });
    await bot.sendPhoto(ADMIN_ID, data.proofTrans, { caption: "🖼️ Proof 2: Transaction" });
    bot.sendMessage(ADMIN_ID, `🆕 **ASA VAOVAO**\n👤 ${user.first_name}\n📝 ${data.description}`, {
        reply_markup: { inline_keyboard: [[{ text: '✅ Manaiky', callback_data: `approve_${docId}_${user.id}` }, { text: '❌ Mandà', callback_data: `reject_${docId}_${user.id}` }]] }
    });
}

async function handleShowJobs(chatId) {
    const q = query(collection(db, "jobs"), where("status", "==", "approved"));
    const snap = await getDocs(q);
    if (snap.empty) return bot.sendMessage(chatId, "📭 Tsy misy asa.");

    snap.forEach(doc => {
        const job = doc.data();
        const info = `💼 **${job.description}**\n🔗 [Hiditra amin'ny asa](${job.link})`;
        const opts = { caption: info, parse_mode: 'Markdown' };

        if (job.mediaType === 'photo') bot.sendPhoto(chatId, job.publicMedia, opts);
        else if (job.mediaType === 'video') bot.sendVideo(chatId, job.publicMedia, opts);
        else if (job.mediaType === 'audio') bot.sendAudio(chatId, job.publicMedia, opts);
        else if (job.mediaType === 'voice') bot.sendVoice(chatId, job.publicMedia, opts); // <-- Fandefasana vocal
        else if (job.mediaType === 'doc') bot.sendDocument(chatId, job.publicMedia, opts);
    });
}
