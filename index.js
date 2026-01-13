const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");

// --- 1. CONFIGURATION ---
// Token sy Admin ID
const token = process.env.TELEGRAM_TOKEN || '8382264998:AAFtVA9PZcEIPdubBI-XrPFRqP3kc16diWA';
const ADMIN_ID = process.env.ADMIN_ID || '8296442213'; 

// Firebase Config
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Bot
const bot = new TelegramBot(token, { polling: true });

// --- 2. SERVER EXPRESS (Mba tsy hatory ny Bot ao amin'ny Render) ---
const appServer = express();
const port = process.env.PORT || 3000;
appServer.get('/', (req, res) => res.send('Bot Asa En Ligne Mada is ACTIVE!'));
appServer.listen(port, () => console.log(`Server running on port ${port}`));


// --- 3. VARIABLES & STORAGE ---
const userStates = {}; // Mitahiry ny étape misy ny user
const jobCache = {};   // Mitahiry ny asa miandry validation admin
let GROUP_ID = null;   // Ho tadidin'ny bot eto ny ID an'ny groupe-nao

// --- 4. GESTION GROUPE & WELCOME ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const type = msg.chat.type;
    const text = msg.text;

    // A. Raha ao anaty GROUPE ny message
    if (type === 'group' || type === 'supergroup') {
        // Tehirizo ny Group ID mba hahafahana mandefa publication any aoriana
        GROUP_ID = chatId;

        // 1. Miarahaba Membres Vaovao (Welcome + Bouton Publier)
        if (msg.new_chat_members) {
            msg.new_chat_members.forEach((member) => {
                if (!member.is_bot) {
                    const welcomeMsg = `
👋 **Miarahaba anao ${member.first_name} tonga ato amin'ny Asa En Ligne Mada!**

Ity groupe ity dia ifampizarana asa matotra. Ny Bot-nay dia manolotra:
✅ Microtache
✅ Trading bot & Crypto
✅ Poppo live (Lahy/Vavy)
✅ Investissement Long Terme

⚠️ **FEPETRA:** Raha hizara asa ianao dia tsy maintsy mandefa PREUVE DE PAIEMENT.

👇 **Tsindrio ny bokotra eto ambany raha hizara asa:**
                    `;
                    
                    // Bokitra mitondra mankany amin'ny Private Chat (Deep Linking)
                    const opts = {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '📢 Publier un travail (Mila Preuve)', url: `https://t.me/AsaEnLigneMG_bot?start=publier` }]
                            ]
                        }
                    };
                    bot.sendMessage(chatId, welcomeMsg, opts);
                }
            });
        }

        // 2. Anti-Scam (Mammafa raha > 4% par jour)
        if (text) {
            const scamRegex = /(\d+)\s*%\s*(par jour|daily|par day|journalier)/i;
            const match = text.match(scamRegex);
            
            if (match) {
                const percentage = parseFloat(match[1]);
                if (percentage > 4) {
                    bot.deleteMessage(chatId, msg.message_id).catch(e => console.log(e));
                    bot.sendMessage(chatId, `⚠️ **FAMPITANDREMANA:** Voafafa ny publication satria mihoatra ny 4% isan'andro ny tombony (Risk Scam).`);
                }
            }
        }
    }
});


// --- 5. PRIVATE CHAT & JOB POSTING FLOW ---

// Mandray ny /start (na tsotra na avy amin'ny groupe)
bot.onText(/\/start(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const param = match[1]; // 'publier' raha avy amin'ny groupe

    // Raha tsy 'publier' no parametre, dia manao Présentation tsotra
    if (!param) {
        const text = `
🤖 **Bot Asa En Ligne Mada**

Manampy anao izahay amin'ny:
➡️ Microtache
➡️ Trading bot
➡️ Poppo live
➡️ Investissement Long Terme
➡️ Cryptomonnaie

👇 **Misafidiana:**
        `;
        const opts = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📝 Hametraka Asa (Publier)', callback_data: 'start_publier' }]
                ]
            }
        };
        bot.sendMessage(chatId, text, opts);
        return;
    }

    // Raha 'publier' (avy amin'ny groupe na bokitra)
    if (param === 'publier') {
        startJobPosting(chatId);
    }
});

// Callback ho an'ny bokitra Start
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'start_publier') {
        bot.answerCallbackQuery(query.id);
        startJobPosting(chatId);
    }
});

// -- LOGIQUE POSTING --

function startJobPosting(chatId) {
    userStates[chatId] = { step: 'ASK_DESC' };
    bot.sendMessage(chatId, "📝 **Dingana 1/3**\n\nAlefaso ny **DESCRIPTION** feno an'ilay asa (sorato daholo izay tianao holazaina):");
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Raha tsy ao anaty process posting dia miala
    if (!userStates[chatId] || msg.chat.type !== 'private') return;

    const state = userStates[chatId];

    // STEP 1: Description -> Link
    if (state.step === 'ASK_DESC' && text && !text.startsWith('/')) {
        state.description = text;
        state.step = 'ASK_LINK';
        bot.sendMessage(chatId, "🔗 **Dingana 2/3**\n\nAlefaso ny **LIEN D'INSCRIPTION** (Mila manomboka amin'ny http:// na https://):");
        return;
    }

    // STEP 2: Link -> Proof
    if (state.step === 'ASK_LINK' && text) {
        if (!text.startsWith('http')) {
            bot.sendMessage(chatId, "⚠️ Diso ny lien. Mila manomboka amin'ny http:// na https://. Avereno azafady.");
            return;
        }
        state.link = text;
        state.step = 'ASK_PROOFS';
        bot.sendMessage(chatId, "📸 **Dingana 3/3 (Farany)**\n\nAlefaso ny sary porofo (Preuve de retrait). \n\n⚠️ **Alefaso sary roa:**\n1. Historique ao amin'ny Site\n2. Reçu ao amin'ny Mobile Money na Wallet.\n\n(Alefaso miaraka na tsirairay, rehefa vita dia miandrasa kely).");
        return;
    }

    // STEP 3: Proofs (Images)
    if (state.step === 'ASK_PROOFS' && msg.photo) {
        // Raisina ny sary
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        
        if (!state.proofs) state.proofs = [];
        state.proofs.push(photoId);

        // Raha vao sary iray no voaray dia ilazana handefa ny faharoa, na raha efa roa dia alefa
        if (state.proofs.length < 2) {
             bot.sendMessage(chatId, "👍 Voaray ny sary voalohany. Alefaso ny faharoa.");
        } else {
            // Efa feno ny sary 2
            bot.sendMessage(chatId, "✅ **Tafiditra ny asanao!**\nAlefa any amin'ny Admin izany izao mba ho hamarinina. Ho hitanao ao amin'ny groupe rehefa voaray.");
            
            // Save to DB
            try {
                await addDoc(collection(db, "jobs"), {
                    userId: msg.from.id,
                    username: msg.from.username || "Inconnu",
                    description: state.description,
                    link: state.link,
                    status: 'pending',
                    timestamp: new Date()
                });
            } catch (e) { console.error("DB Error", e); }

            // Send to Admin
            sendToAdmin(chatId, state, msg.from);
            
            // Clear state
            delete userStates[chatId];
        }
    }
});


// --- 6. ADMIN MANAGEMENT ---

async function sendToAdmin(userId, jobData, userInfo) {
    const caption = `
🆕 **VALIDATION REQUIRED**
👤 User: ${userInfo.first_name} (@${userInfo.username})
🆔 UserID: ${userId}

📝 **Description:**
${jobData.description}

🔗 **Lien:** ${jobData.link}
    `;

    // 1. Mandefa ny sary any amin'ny admin (Album)
    const media = jobData.proofs.map((fileId, index) => ({
        type: 'photo',
        media: fileId,
        caption: index === 0 ? caption : '' // Caption amin'ny sary voalohany ihany
    }));

    await bot.sendMediaGroup(ADMIN_ID, media);

    // 2. Mandefa ny bouton Action (Misaraka satria MediaGroup tsy manaiky bouton)
    // Tehirizina ao amin'ny cache ilay asa
    jobCache[userId] = jobData;

    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Valider (Publier)', callback_data: `approve_${userId}` },
                    { text: '❌ Refuser', callback_data: `reject_${userId}` }
                ],
                [
                    { text: '📩 Message User', callback_data: `msg_${userId}` }
                ]
            ]
        }
    };
    bot.sendMessage(ADMIN_ID, `Hetsika ho an'ny asan'i ${userInfo.first_name}:`, opts);
}

// Admin Actions
bot.on('callback_query', async (query) => {
    const action = query.data;
    const msg = query.message;
    const adminChatId = msg.chat.id;

    if (adminChatId.toString() !== ADMIN_ID.toString()) return;

    // APPROVE
    if (action.startsWith('approve_')) {
        const targetId = action.split('_')[1];
        const job = jobCache[targetId];

        if (job) {
            // Alefa any amin'ny User
            bot.sendMessage(targetId, "✅ **Faly miarahaba!** Neken'ny Admin ny asanao ary efa navoaka ao amin'ny Groupe.");

            // Alefa any amin'ny GROUPE (Raha efa nianatra ny ID ny bot)
            if (GROUP_ID) {
                const groupCaption = `
💼 **ASA VAOVAO REEHETRA!** ${job.description}

✅ **Preuve de paiement:** Verified by Admin
👇 Midira eto:
                `;
                
                const groupOpts = {
                    caption: groupCaption,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 S\'inscrire amin\'ny Site', url: job.link }]
                        ]
                    }
                };
                
                // Mandefa ny sary iray (Preuve) + Texte + Bouton ao amin'ny groupe
                await bot.sendPhoto(GROUP_ID, job.proofs[0], groupOpts);
                bot.sendMessage(ADMIN_ID, "✅ Voa-publié soa aman-tsara tao amin'ny Groupe.");
            } else {
                bot.sendMessage(ADMIN_ID, "⚠️ **Tsy mbola fantatro ny ID an'ny Groupe.**\nAlefaso any amin'ny groupe aloha aho dia manorata zavatra kely, dia andramo validerina indray.");
            }
            delete jobCache[targetId];
        } else {
            bot.sendMessage(ADMIN_ID, "⚠️ Expired data.");
        }
    }

    // REJECT
    if (action.startsWith('reject_')) {
        const targetId = action.split('_')[1];
        bot.sendMessage(targetId, "❌ **Nolavina.** Ny asanao dia tsy neken'ny Admin. Mety tsy ampy ny porofo na tsy mazava ny fanazavana.");
        bot.answerCallbackQuery(query.id, { text: 'Nolavina.' });
        delete jobCache[targetId];
    }
});
