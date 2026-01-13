const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, getDoc, doc, updateDoc } = require("firebase/firestore");

// --- CONFIGURATION ---
// Soloinao eto ny Token-nao sy ny Admin ID
const token = process.env.TELEGRAM_TOKEN || '8382264998:AAFtVA9PZcEIPdubBI-XrPFRqP3kc16diWA';
const ADMIN_ID = process.env.ADMIN_ID || '8296442213';

// Firebase Config (Ilay nomenao)
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

// State management (Mitehirizy ny étape misy ilay olona)
const userStates = {}; 

// --- SERVER EXPRESS (Mba tsy hatory ny bot amin'ny Render) ---
const appServer = express();
const port = process.env.PORT || 3000;
appServer.get('/', (req, res) => res.send('Bot Asa En Ligne Mada is running!'));
appServer.listen(port, () => console.log(`Server running on port ${port}`));


// --- 1. WELCOME MESSAGE & GROUP LOGIC ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    // A. Miarahaba olona vaovao miditra
    if (msg.new_chat_members) {
        msg.new_chat_members.forEach((member) => {
            if (!member.is_bot) {
                const welcomeMsg = `
👋 Miarahaba anao ${member.first_name} tonga ato amin'ny **Asa En Ligne Mada**!

Ity groupe ity dia natao hifampizarana asa matotra sy azo antoka.

🤖 **Ny Bot-nay dia manolotra fampianarana momba ny:**
➡️ Microtache
➡️ Trading bot
➡️ Poppo live (Lahy/Vavy)
➡️ Investissement Long Terme
➡️ Cryptomonnaie

🔗 **Raha liana ianao, midira eto:**
https://t.me/AsaEnLigneMG_bot

💡 **Te hizara asa?**
Mila porofo (Preuve de retrait) ianao vao afaka mizara. Tsindrio ny bokotra eto ambany.
                `;
                
                const opts = {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '📢 Publier un travail', url: `https://t.me/AsaEnLigneMG_bot?start=publier` }]
                        ]
                    }
                };
                bot.sendMessage(chatId, welcomeMsg, opts);
            }
        });
    }

    // B. Mammafa publication raha > 4% par jour (Anti-Scam)
    if (text) {
        // Regex mijery isa arahina % sy teny hoe "jour" na "daily"
        const scamRegex = /(\d+)\s*%\s*(par jour|daily|par day)/i;
        const match = text.match(scamRegex);
        
        if (match) {
            const percentage = parseFloat(match[1]);
            if (percentage > 4) {
                bot.deleteMessage(chatId, msg.message_id).catch(e => console.log(e));
                bot.sendMessage(chatId, `⚠️ **FAMPITANDREMANA:** Voafafa ny publication an'i ${msg.from.first_name} satria mihoatra ny 4% isan'andro ny tombony (Risk Scam).`);
            }
        }
    }
});


// --- 2. JOB POSTING FLOW (Ao amin'ny Private Chat) ---

// Manomboka ny procedure
bot.onText(/\/start (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const param = match[1];

    if (param === 'publier') {
        userStates[chatId] = { step: 'ASK_DESC' };
        bot.sendMessage(chatId, "📝 Alefaso ny **Description** an'ilay asa tianao zaraina:");
    }
});

// Gestion des réponses (Text & Images)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    // Raha tsy ao anaty process dia ignore
    if (!userStates[chatId]) return;

    const currentState = userStates[chatId];

    // STEP 1: Description
    if (currentState.step === 'ASK_DESC' && text) {
        currentState.description = text;
        currentState.step = 'ASK_LINK';
        bot.sendMessage(chatId, "🔗 Alefaso ny **Lien d'inscription** (Mba ho lasa bokotra 'S'inscrire'):");
        return;
    }

    // STEP 2: Lien
    if (currentState.step === 'ASK_LINK' && text) {
        // Check raha URL marina (tsotsotra)
        if (!text.startsWith('http')) {
            bot.sendMessage(chatId, "⚠️ Mila manomboka amin'ny http:// na https:// ny lien. Avereno azafady.");
            return;
        }
        currentState.link = text;
        currentState.step = 'ASK_PROOF_SITE';
        bot.sendMessage(chatId, "📸 Alefaso ny sary 1: **Historique de transaction ao amin'ny SITE**:");
        return;
    }

    // STEP 3: Preuve Site (Image)
    if (currentState.step === 'ASK_PROOF_SITE' && msg.photo) {
        currentState.proof1 = msg.photo[msg.photo.length - 1].file_id; // Raisina ny sary quality tsara indrindra
        currentState.step = 'ASK_PROOF_WALLET';
        bot.sendMessage(chatId, "📸 Alefaso ny sary 2: **Historique de transaction ao amin'ny PORTEFEUILLE** (Mvola/Binance/etc):");
        return;
    }

    // STEP 4: Preuve Wallet (Image) + FIN
    if (currentState.step === 'ASK_PROOF_WALLET' && msg.photo) {
        currentState.proof2 = msg.photo[msg.photo.length - 1].file_id;
        
        // Save to Firebase (Optional - fa tsara ho an'ny archives)
        try {
            await addDoc(collection(db, "jobs"), {
                userId: msg.from.id,
                username: msg.from.username || msg.from.first_name,
                description: currentState.description,
                link: currentState.link,
                status: 'pending',
                timestamp: new Date()
            });
        } catch (e) {
            console.error("Error adding to DB", e);
        }

        bot.sendMessage(chatId, "✅ Voarainay ny asanao. Mbola **En attente de validation** any amin'ny Admin io. Ho hitanao ao amin'ny groupe rehefa voamarina.");

        // Alefa any amin'ny Admin
        sendToAdminForApproval(chatId, currentState, msg.from);
        
        // Reset state
        delete userStates[chatId];
    }
});


// --- 3. ADMIN MANAGEMENT ---

async function sendToAdminForApproval(userChatId, jobData, userInfo) {
    const caption = `
🆕 **DEMANDE DE PUBLICATION**
👤 User: ${userInfo.first_name} (@${userInfo.username})
ID: ${userChatId}

📝 **Description:**
${jobData.description}

🔗 **Lien:** ${jobData.link}

👇 Jereo ny sary porofo roa ambany 👇
    `;

    // Mandefa ny sary sy ny details any amin'ny Admin
    await bot.sendMediaGroup(ADMIN_ID, [
        { type: 'photo', media: jobData.proof1, caption: caption }, // Caption only on first item
        { type: 'photo', media: jobData.proof2 }
    ]);

    // Mandefa bokotra Action ho an'ny Admin
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Valider (Publier)', callback_data: `approve_${userChatId}` },
                    { text: '❌ Refuser', callback_data: `reject_${userChatId}` }
                ],
                [
                    { text: '📩 Manoratra hafatra (DM)', callback_data: `msg_${userChatId}` }
                ]
            ]
        }
    };
    // Tsy maintsy atao hafatra mitokana ny bouton satria mediaGroup tsy manaiky bouton
    // Mila tehirizina any ho any ny data mba ho azo ampiasaina rehefa mikitika ny admin.
    // Eto dia mampiasa memory cache tsotra isika (jobCache).
    jobCache[userChatId] = jobData;
    bot.sendMessage(ADMIN_ID, `Action ho an'ny post-n'i ${userInfo.first_name}:`, opts);
}

const jobCache = {}; // Cache temporaire ho an'ny admin actions

// Admin Actions Handler
bot.on('callback_query', async (callbackQuery) => {
    const action = callbackQuery.data;
    const msg = callbackQuery.message;
    const adminChatId = msg.chat.id;

    if (adminChatId.toString() !== ADMIN_ID.toString()) return;

    if (action.startsWith('approve_')) {
        const targetUserId = action.split('_')[1];
        const jobData = jobCache[targetUserId];

        if (jobData) {
            // 1. Alefa any amin'ny Groupe
            // Mila ID an'ny groupe ianao eto. Atao hoe "GROUP_ID" na manao env var.
            // Azonao atao koa ny manao forward na manamboatra post vaovao.
            
            // Raha te hahalala ny Group ID dia asio console.log(msg.chat.id) ao amin'ny group handler.
            // Eto dia hipost ao amin'ny group
            // Mila fantatra ny ID-n'ny groupe. Matetika manomboka amin'ny -100...
            // Ohatra: const GROUP_ID = '-100xxxxxxxx'; 
            
            // Ho an'ny demo, dia alefako miverina any amin'ny admin ho fanehoana, fa soloy GROUP ID io.
            // Mba hahazoana ny ID Groupe: Ampidiro ao amin'ny groupe ny bot dia manorata zavatra dia jereo ny logs.
            
            const postCaption = `
💼 **ASA VAOVAO REEHETRA!** 💼

${jobData.description}

✅ **Preuve de paiement:** Verified by Admin
            `;

            const postOpts = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚀 S\'inscrire eto', url: jobData.link }]
                    ]
                }
            };
            
            // ETO: Soloy ny ID-ny groupe ny 'adminChatId' rehefa tena izy
             // bot.sendPhoto(GROUP_ID, jobData.proof2, postOpts); 
             // Satria tianao hisy sary porofo:
             await bot.sendPhoto(adminChatId, jobData.proof2, postOpts); // Test mode (Admin mahita)
            
             // Filazana amin'ny Admin
             bot.answerCallbackQuery(callbackQuery.id, { text: 'Nalefa tany amin\'ny groupe!' });
             bot.sendMessage(adminChatId, "✅ Nalefa tany amin'ny groupe ilay izy.");

             // Filazana amin'ny User
             bot.sendMessage(targetUserId, "✅ Arahabaina! Neken'ny Admin ny publication-nao ary efa hita ao amin'ny groupe.");
             
             delete jobCache[targetUserId];
        } else {
            bot.sendMessage(adminChatId, "⚠️ Tsy hita intsony ny data (mety efa restart ny server).");
        }
    }

    if (action.startsWith('reject_')) {
        const targetUserId = action.split('_')[1];
        bot.sendMessage(targetUserId, "❌ Miala tsiny, nolavin'ny Admin ny publication-nao. Hamarino ny porofo na ny description.");
        bot.answerCallbackQuery(callbackQuery.id, { text: 'Refusé.' });
        delete jobCache[targetUserId];
    }

    if (action.startsWith('msg_')) {
        const targetUserId = action.split('_')[1];
        userStates[ADMIN_ID] = { step: 'ADMIN_DM', target: targetUserId };
        bot.sendMessage(ADMIN_ID, "✍️ Manorata ny hafatra halefa any amin'io olona io:");
        bot.answerCallbackQuery(callbackQuery.id);
    }
});

// Admin DM Handler
bot.on('message', (msg) => {
    if (msg.chat.id.toString() === ADMIN_ID.toString() && userStates[ADMIN_ID]?.step === 'ADMIN_DM') {
        const targetUser = userStates[ADMIN_ID].target;
        bot.sendMessage(targetUser, `📩 **Message avy amin'ny Admin:**\n\n${msg.text}`);
        bot.sendMessage(ADMIN_ID, "✅ Lasa ny hafatra.");
        delete userStates[ADMIN_ID];
    }
});
