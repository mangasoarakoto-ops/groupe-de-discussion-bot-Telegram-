const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, doc, updateDoc } = require("firebase/firestore");

// --- 1. CONFIGURATION VAOVAO ---
const token = process.env.TELEGRAM_TOKEN || '8525418474:AAHebHUTYrpKAq0Dr4UPPehYOYAacTMuYmA';
const ADMIN_ID = process.env.ADMIN_ID || '8207051152'; 

// Firebase Config (Mbola ilay taloha ihany satria ilaina ny Database)
const firebaseConfig = {
  apiKey: "AIzaSyDPrTWmxovZdbbi0BmXr6Tn6AyrlaO0cbM",
  authDomain: "bot-asa-en-ligne-mada.firebaseapp.com",
  databaseURL: "https://bot-asa-en-ligne-mada-default-rtdb.firebaseio.com",
  projectId: "bot-asa-en-ligne-mada",
  storageBucket: "bot-asa-en-ligne-mada.firebasestorage.app",
  messagingSenderId: "837671675184",
  appId: "1:837671675184:web:2cd55ef7eacac7e33554f5",
  measurementId: "G-72CKQLX75V"
};

// Initialize Firebase & Bot
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const bot = new TelegramBot(token, { polling: true });

// --- 2. SERVER EXPRESS (Mba tsy hatory ny Bot ao amin'ny Render) ---
const appServer = express();
const port = process.env.PORT || 3000;
appServer.get('/', (req, res) => res.send('Bot Asa En Ligne (Mode Standalone) ACTIVE!'));
appServer.listen(port, () => console.log(`Server running on port ${port}`));

// --- 3. VARIABLES TEMPORAIRES ---
const userStates = {}; 
const jobCache = {}; 

// --- 4. MENU PRINCIPAL ---

bot.onText(/\/start/, (msg) => {
    showMainMenu(msg.chat.id, msg.from.first_name);
});

function showMainMenu(chatId, name) {
    const text = `
👋 **Salama ${name}!**

Tongasoa ato amin'ny **Asa En Ligne Mada**.
Ity Bot ity dia ahafahanao mahita asa na mizara asa (Mila Preuve).

👇 **Safidio ny tianao hatao:**
    `;
    
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🔍 Hijery Asa (Disponibles)', callback_data: 'view_jobs' }
                ],
                [
                    { text: '📝 Hizara Asa (Publier)', callback_data: 'start_publier' }
                ],
                [
                    { text: '📞 Contact Admin', callback_data: 'contact_admin' }
                ]
            ]
        }
    };
    bot.sendMessage(chatId, text, opts);
}

// --- 5. LOGIQUE BOUTONS ---

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const msgId = query.message.message_id;

    // A. HIJERY ASA (VIEW JOBS)
    if (data === 'view_jobs') {
        bot.answerCallbackQuery(query.id, { text: 'Amakiana ny asa...' });
        
        try {
            // Maka ny asa 5 farany izay status = 'approved'
            const jobsRef = collection(db, "jobs");
            const q = query(jobsRef, where("status", "==", "approved"), orderBy("timestamp", "desc"), limit(5));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                bot.sendMessage(chatId, "📭 **Mbola tsy misy asa disponible amin'izao.**");
            } else {
                bot.sendMessage(chatId, "👇 **Ireto ny asa vao haingana:**");
                
                querySnapshot.forEach((doc) => {
                    const job = doc.data();
                    const text = `
💼 **${job.description}**

🔗 **Lien:** ${job.link}
📅 **Daty:** ${new Date(job.timestamp.seconds * 1000).toLocaleDateString('fr-FR')}

✅ *Verified by Admin*
                    `;
                    bot.sendMessage(chatId, text, { disable_web_page_preview: true });
                });
            }
        } catch (error) {
            console.error("Error getting jobs:", error);
            bot.sendMessage(chatId, "⚠️ Nisy olana teo amin'ny connexion.");
        }
    }

    // B. HIZARA ASA (PUBLIER)
    if (data === 'start_publier') {
        bot.answerCallbackQuery(query.id);
        startJobPosting(chatId);
    }

    // C. CONTACT ADMIN
    if (data === 'contact_admin') {
        bot.sendMessage(chatId, "💬 Raha misy fanontaniana dia manorata mivantana any amin'ny: @H_G_M_1");
    }

    // D. ADMIN ACTIONS (Approve/Reject)
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        handleAdminAction(query);
    }
});

// --- 6. FLOW FAMETRAHANA ASA (POSTING) ---

function startJobPosting(chatId) {
    userStates[chatId] = { step: 'ASK_DESC' };
    bot.sendMessage(chatId, "📝 **Dingana 1/3**\n\nAlefaso ny **DESCRIPTION** ny asa (Manorata mazava):");
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Tsy mandray message raha tsy Private
    if (msg.chat.type !== 'private') return;
    
    // Raha /start dia miverina menu
    if (text === '/start') return;

    if (!userStates[chatId]) return;
    const state = userStates[chatId];

    // STEP 1: Description
    if (state.step === 'ASK_DESC' && text) {
        // Anti-scam check simple
        if (text.toLowerCase().includes("300%") || text.toLowerCase().includes("500%")) {
             bot.sendMessage(chatId, "⚠️ **Tsy ekena:** Ahiana ho Scam.");
             return;
        }

        state.description = text;
        state.step = 'ASK_LINK';
        bot.sendMessage(chatId, "🔗 **Dingana 2/3**\n\nAlefaso ny **LIEN D'INSCRIPTION** (manomboka amin'ny http://...):");
        return;
    }

    // STEP 2: Link
    if (state.step === 'ASK_LINK' && text) {
        if (!text.startsWith('http')) {
            bot.sendMessage(chatId, "⚠️ Diso ny lien. Mila manomboka amin'ny http:// na https://.");
            return;
        }
        state.link = text;
        state.step = 'ASK_PROOFS';
        bot.sendMessage(chatId, "📸 **Dingana 3/3**\n\nAlefaso ny sary POROFO (Preuve de retrait/paiement). \n*Alefaso sary 1 na 2, dia miandrasa kely.*");
        return;
    }

    // STEP 3: Proofs (Images)
    if (state.step === 'ASK_PROOFS' && msg.photo) {
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        if (!state.proofs) state.proofs = [];
        state.proofs.push(photoId);

        // Timer kely mba ahafahana mandefa sary maromaro
        if (!state.timer) {
            state.timer = setTimeout(async () => {
                bot.sendMessage(chatId, "✅ **Voaray ny asanao!**\nAlefa any amin'ny Admin mba ho hamarinina. Ho hitan'ny olona eto amin'ny Bot rehefa ekena.");
                
                // 1. Save to DB (Status: pending)
                try {
                    const docRef = await addDoc(collection(db, "jobs"), {
                        userId: msg.from.id,
                        username: msg.from.username || "Inconnu",
                        description: state.description,
                        link: state.link,
                        status: 'pending',
                        proofs: state.proofs, // Tehirizina koa ny ID sary
                        timestamp: new Date()
                    });
                    
                    // 2. Send to Admin
                    sendToAdmin(chatId, state, msg.from, docRef.id);
                } catch (e) { console.error("DB Error", e); }
                
                delete userStates[chatId];
            }, 3000); // 3 segondra
        }
    }
});

// --- 7. ADMIN MANAGEMENT ---

async function sendToAdmin(userId, jobData, userInfo, docId) {
    const caption = `
🆕 **ASA VAOVAO MILA VALIDATION**
👤 User: ${userInfo.first_name} (@${userInfo.username})

📝 **Desc:** ${jobData.description}
🔗 **Lien:** ${jobData.link}
    `;

    // Alefa ny sary any amin'ny Admin
    if (jobData.proofs.length > 0) {
        await bot.sendPhoto(ADMIN_ID, jobData.proofs[0], { caption: caption });
    } else {
        await bot.sendMessage(ADMIN_ID, caption);
    }

    // Boutons Action (Mampiasa ny Doc ID avy any amin'ny Firestore)
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Manaiky (Approuver)', callback_data: `approve_${docId}_${userId}` },
                    { text: '❌ Mandà (Rejeter)', callback_data: `reject_${docId}_${userId}` }
                ]
            ]
        }
    };
    bot.sendMessage(ADMIN_ID, "Inona no atao amin'ity?", opts);
}

// Admin Actions Logic
async function handleAdminAction(query) {
    const action = query.data;
    const parts = action.split('_'); // [action, docId, userId]
    const type = parts[0];
    const docId = parts[1];
    const targetUserId = parts[2];

    // Admin Security Check
    if (query.from.id.toString() !== ADMIN_ID.toString()) return;

    if (type === 'approve') {
        // Update DB status to 'approved'
        try {
            const jobRef = doc(db, "jobs", docId);
            await updateDoc(jobRef, { status: "approved" });

            bot.sendMessage(targetUserId, "✅ **Faly miarahaba!** Neken'ny Admin ny asanao. Efa hita ao amin'ny lisitry ny asa (Hijery Asa) izany izao.");
            bot.sendMessage(ADMIN_ID, "✅ Job Approuvé & Live.");
            
            // Delete boutons admin
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: ADMIN_ID, message_id: query.message.message_id });

        } catch (e) {
            console.log(e);
            bot.sendMessage(ADMIN_ID, "⚠️ Error DB update.");
        }
    }

    if (type === 'reject') {
        try {
            const jobRef = doc(db, "jobs", docId);
            await updateDoc(jobRef, { status: "rejected" });
            
            bot.sendMessage(targetUserId, "❌ **Nolavina.** Ny asanao dia tsy neken'ny Admin (Mety tsy ampy porofo na tsy mazava).");
            bot.answerCallbackQuery(query.id, { text: 'Nolavina.' });
            
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: ADMIN_ID, message_id: query.message.message_id });
        } catch (e) { console.log(e); }
    }
}
