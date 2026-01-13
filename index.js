const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, doc, updateDoc } = require("firebase/firestore");

// --- 1. CONFIGURATION ---
const token = process.env.TELEGRAM_TOKEN || '8525418474:AAHebHUTYrpKAq0Dr4UPPehYOYAacTMuYmA';
const ADMIN_ID = process.env.ADMIN_ID || '8207051152'; 

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

// Initialize
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const bot = new TelegramBot(token, { polling: true });

// --- 2. SERVER EXPRESS ---
const appServer = express();
const port = process.env.PORT || 3000;
appServer.get('/', (req, res) => res.send('Bot Asa En Ligne ACTIVE!'));
appServer.listen(port, () => console.log(`Server running on port ${port}`));

// --- 3. VARIABLES TEMPORAIRES ---
const userStates = {}; 

// --- 4. CLAVIER FIXE (Persistent Menu) ---
// Ity ilay fonction mametraka ny bokitra eo ambany
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: '🔍 Hijery Asa' }, { text: '📝 Hizara Asa' }],
            [{ text: '🔄 Actualiser' }, { text: '📞 Admin' }]
        ],
        resize_keyboard: true, // Mba tsy ho lehibe loatra ny bokitra
        persistent: true       // Mipetraka foana (tsy mi-caché)
    },
    parse_mode: 'Markdown'
};

// --- 5. LOGIQUE MESSAGE (Boutons + Flow) ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const name = msg.from.first_name;

    // A. RAHA MANORATRA /start
    if (text === '/start') {
        const welcomeText = `
👋 **Salama ${name}!**

Tongasoa ato amin'ny **Asa En Ligne Mada**.
Ampiasao ireo bokitra eo ambany ireo mba hitetezana ny Bot.
        `;
        bot.sendMessage(chatId, welcomeText, mainKeyboard);
        return;
    }

    // B. RAHA EO AM-PANORATANA ASA (Flow Publication)
    if (userStates[chatId]) {
        handleJobPostingSteps(chatId, msg);
        return;
    }

    // C. GESTION DES BOUTONS DU MENU (TEXTE)
    
    // --- 1. HIJERY ASA & ACTUALISER ---
    if (text === '🔍 Hijery Asa' || text === '🔄 Actualiser') {
        bot.sendMessage(chatId, "⏳ **Maka ny lisitry ny asa...**");
        
        try {
            const jobsRef = collection(db, "jobs");
            // NOTE: Raha misy erreur "Index", jereo ny console log
            const q = query(jobsRef, where("status", "==", "approved"), orderBy("timestamp", "desc"), limit(5));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                bot.sendMessage(chatId, "📭 **Mbola tsy misy asa disponible amin'izao.**\nAndramo Actualiser afaka kelikely.", mainKeyboard);
            } else {
                bot.sendMessage(chatId, "👇 **Ireto ny asa vao haingana:**", mainKeyboard);
                
                querySnapshot.forEach((doc) => {
                    const job = doc.data();
                    const jobText = `
💼 **${job.description}**

🔗 **Lien:** ${job.link}
📅 **Daty:** ${new Date(job.timestamp.seconds * 1000).toLocaleDateString('fr-FR')}

✅ *Verified by Admin*
                    `;
                    bot.sendMessage(chatId, jobText, { disable_web_page_preview: true });
                });
            }
        } catch (error) {
            console.error("Error fetching jobs:", error);
            // Matetika raha 'FAILED_PRECONDITION', mila index ao amin'ny Firebase console
            if (error.code === 'failed-precondition') {
                console.log("⚠️ MILA INDEX: Jereo ny lien ao amin'ny error log etsy ambony hamoronana azy.");
            }
            bot.sendMessage(chatId, "⚠️ **Nisy olana tamin'ny connexion.** \n(Mety mila verificatin ny Admin ny Database na ny Index).", mainKeyboard);
        }
    }

    // --- 2. HIZARA ASA ---
    else if (text === '📝 Hizara Asa') {
        userStates[chatId] = { step: 'ASK_DESC' };
        // Esorina kely ny clavier mba hifantoka amin'ny fanoratana, na avela eo (safidy).
        // Eto dia avelantsika eo fa alefa ny hafatra :
        bot.sendMessage(chatId, "📝 **Dingana 1/3**\n\nAlefaso ny **DESCRIPTION** ny asa (Manorata mazava):", { reply_markup: { remove_keyboard: true } }); 
        // Nesoriko kely ny clavier eto mba tsy hanelingelina ny saisie, hiverina izy rehefa vita.
    }

    // --- 3. ADMIN ---
    else if (text === '📞 Admin') {
        bot.sendMessage(chatId, "💬 Raha misy fanontaniana na olana dia manorata mivantana any amin'ny: @H_G_M_1", mainKeyboard);
    }
});

// --- 6. FLOW DÉTAILLÉ (POSTING) ---

async function handleJobPostingSteps(chatId, msg) {
    const text = msg.text;
    const state = userStates[chatId];

    // STEP 1: Description
    if (state.step === 'ASK_DESC' && text) {
        if (text.toLowerCase().includes("300%") || text.toLowerCase().includes("500%")) {
             bot.sendMessage(chatId, "⚠️ **Tsy ekena:** Ahiana ho Scam. Avereno azafady.");
             return;
        }
        state.description = text;
        state.step = 'ASK_LINK';
        bot.sendMessage(chatId, "🔗 **Dingana 2/3**\n\nAlefaso ny **LIEN D'INSCRIPTION** (manomboka amin'ny http...):");
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
        bot.sendMessage(chatId, "📸 **Dingana 3/3**\n\nAlefaso ny sary POROFO (Preuve de retrait/paiement). \n*Alefaso sary 1 na 2.*");
        return;
    }

    // STEP 3: Proofs (Images)
    if (state.step === 'ASK_PROOFS' && msg.photo) {
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        if (!state.proofs) state.proofs = [];
        state.proofs.push(photoId);

        if (!state.timer) {
            state.timer = setTimeout(async () => {
                bot.sendMessage(chatId, "✅ **Voaray ny asanao!**\nAlefa any amin'ny Admin mba ho hamarinina.", mainKeyboard); // Averina ny Clavier eto
                
                try {
                    const docRef = await addDoc(collection(db, "jobs"), {
                        userId: msg.from.id,
                        username: msg.from.username || "Inconnu",
                        description: state.description,
                        link: state.link,
                        status: 'pending',
                        proofs: state.proofs,
                        timestamp: new Date()
                    });
                    
                    sendToAdmin(chatId, state, msg.from, docRef.id);
                } catch (e) { console.error("DB Error", e); }
                
                delete userStates[chatId];
            }, 3000);
        }
    }
}

// --- 7. ADMIN ACTIONS (CALLBACK QUERY) ---
// Mbola ilaina ity ho an'ny Admin manaiky na mandà asa (Inside chat button)

bot.on('callback_query', async (query) => {
    const data = query.data;
    
    // Admin Actions (Approve/Reject)
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const parts = data.split('_'); // [action, docId, userId]
        const type = parts[0];
        const docId = parts[1];
        const targetUserId = parts[2];

        // Security Check
        if (query.from.id.toString() !== ADMIN_ID.toString()) return;

        try {
            const jobRef = doc(db, "jobs", docId);
            
            if (type === 'approve') {
                await updateDoc(jobRef, { status: "approved" });
                bot.sendMessage(targetUserId, "✅ **Faly miarahaba!** Neken'ny Admin ny asanao. Efa hita ao amin'ny lisitra izany izao.");
                bot.sendMessage(ADMIN_ID, "✅ Job Approuvé.");
            } else {
                await updateDoc(jobRef, { status: "rejected" });
                bot.sendMessage(targetUserId, "❌ **Nolavina.** Tsy neken'ny Admin ny asanao.");
                bot.sendMessage(ADMIN_ID, "❌ Job Rejeté.");
            }
            // Delete boutons admin
            bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: ADMIN_ID, message_id: query.message.message_id });
            bot.answerCallbackQuery(query.id);
        } catch (e) {
            console.log(e);
            bot.sendMessage(ADMIN_ID, "⚠️ Error DB update.");
        }
    }
});

async function sendToAdmin(userId, jobData, userInfo, docId) {
    const caption = `🆕 **ASA VAOVAO**\n👤 User: ${userInfo.first_name}\n📝 Desc: ${jobData.description}\n🔗 Lien: ${jobData.link}`;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Manaiky', callback_data: `approve_${docId}_${userId}` },
                    { text: '❌ Mandà', callback_data: `reject_${docId}_${userId}` }
                ]
            ]
        }
    };

    if (jobData.proofs.length > 0) {
        await bot.sendPhoto(ADMIN_ID, jobData.proofs[0], { caption: caption, reply_markup: opts.reply_markup });
    } else {
        await bot.sendMessage(ADMIN_ID, caption, opts);
    }
}
