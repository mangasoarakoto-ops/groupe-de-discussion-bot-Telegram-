const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, query, where, getDocs, doc, updateDoc } = require("firebase/firestore");

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

// Initialize App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const bot = new TelegramBot(token, { polling: true });

// --- 2. SERVER EXPRESS (Mba hijanona ho velona ny bot) ---
const appServer = express();
const port = process.env.PORT || 3000;
appServer.get('/', (req, res) => res.send('Bot Asa En Ligne ACTIVE!'));
appServer.listen(port, () => console.log(`Server running on port ${port}`));

// --- 3. VARIABLES & MENU ---
const userStates = {}; 

// Ity ilay Bokitra Fixe (Clavier maharitra)
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            [{ text: '🔍 Hijery Asa' }, { text: '📝 Hizara Asa' }],
            [{ text: '🔄 Actualiser' }, { text: '📞 Admin' }]
        ],
        resize_keyboard: true // Mba tsy ho lehibe loatra
    },
    parse_mode: 'Markdown'
};

// --- 4. LOGIQUE PRINCIPALE ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const name = msg.from.first_name;

    // Tsy mandray message raha tsy Private (fiarovana kely)
    if (msg.chat.type !== 'private') return;

    // A. MENU START
    if (text === '/start') {
        const welcomeText = `
👋 **Salama ${name}!**

Tongasoa ato amin'ny **Asa En Ligne Mada**.
Ampiasao ireo bokitra eo ambany ireo mba hitetezana ny Bot.
        `;
        bot.sendMessage(chatId, welcomeText, mainKeyboard);
        return;
    }

    // B. FLOW FAMETRAHANA ASA (Raha ao anaty dingana ilay olona)
    if (userStates[chatId]) {
        handleJobPostingSteps(chatId, msg);
        return;
    }

    // C. GESTION DES BOUTONS (Menu Fixe)

    // --- 1. HIJERY ASA & ACTUALISER (Correction Index) ---
    if (text === '🔍 Hijery Asa' || text === '🔄 Actualiser') {
        bot.sendMessage(chatId, "⏳ **Maka ny lisitry ny asa...**");
        
        try {
            const jobsRef = collection(db, "jobs");
            
            // FANOVANA LEHIBE: Nesorina ny 'orderBy' mba tsy hila Index
            // Maka ny asa rehetra izay 'approved'
            const q = query(jobsRef, where("status", "==", "approved"));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                bot.sendMessage(chatId, "📭 **Mbola tsy misy asa disponible amin'izao.**\nAndramo Actualiser afaka kelikely.", mainKeyboard);
            } else {
                // Eto isika manao ny 'Tri' (Filaharana) amin'ny alalan'ny Javascript
                let jobsList = [];
                querySnapshot.forEach((doc) => {
                    jobsList.push(doc.data());
                });

                // Mandahatra: Ny daty vaovao indrindra no atao ambony
                jobsList.sort((a, b) => {
                    // Fiarovana raha tsy misy timestamp
                    const timeA = a.timestamp ? a.timestamp.seconds : 0;
                    const timeB = b.timestamp ? b.timestamp.seconds : 0;
                    return timeB - timeA;
                });

                // Maka ny 5 voalohany fotsiny
                const recentJobs = jobsList.slice(0, 5);

                bot.sendMessage(chatId, "👇 **Ireto ny asa vao haingana:**", mainKeyboard);
                
                recentJobs.forEach((job) => {
                    const jobText = `
💼 **${job.description}**

🔗 **Lien:** ${job.link}
📅 **Daty:** ${job.timestamp ? new Date(job.timestamp.seconds * 1000).toLocaleDateString('fr-FR') : 'Vao haingana'}

✅ *Verified by Admin*
                    `;
                    bot.sendMessage(chatId, jobText, { disable_web_page_preview: true });
                });
            }
        } catch (error) {
            console.error("Error fetching jobs:", error);
            bot.sendMessage(chatId, "⚠️ **Mbola misy olana kely.**\nAndramo rehefa avy eo.", mainKeyboard);
        }
    }

    // --- 2. HIZARA ASA ---
    else if (text === '📝 Hizara Asa') {
        userStates[chatId] = { step: 'ASK_DESC' };
        // Esorina vonjimaika ny clavier mba hifantohany
        bot.sendMessage(chatId, "📝 **Dingana 1/3**\n\nAlefaso ny **DESCRIPTION** ny asa (Manorata mazava):", { reply_markup: { remove_keyboard: true } });
    }

    // --- 3. ADMIN CONTACT ---
    else if (text === '📞 Admin') {
        bot.sendMessage(chatId, "💬 Raha misy fanontaniana na olana dia manorata mivantana any amin'ny: @H_G_M_1", mainKeyboard);
    }
});

// --- 5. FUNCTION POSTING (Dingana Fizarana Asa) ---

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

        // Timer mba ahafahana mandefa sary maromaro (3 segondra)
        if (!state.timer) {
            state.timer = setTimeout(async () => {
                bot.sendMessage(chatId, "✅ **Voaray ny asanao!**\nAlefa any amin'ny Admin mba ho hamarinina.", mainKeyboard); // Mamerina ny Clavier
                
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

// --- 6. ADMIN CALLBACKS (Approve/Reject) ---

bot.on('callback_query', async (query) => {
    const data = query.data;
    
    // Check raha Admin
    if (query.from.id.toString() !== ADMIN_ID.toString()) return;

    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const parts = data.split('_'); // [action, docId, userId]
        const type = parts[0];
        const docId = parts[1];
        const targetUserId = parts[2];

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
            
            // Fafana ny boutons
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
