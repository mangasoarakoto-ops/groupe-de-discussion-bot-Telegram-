const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc } = require("firebase/firestore");

// --- 1. CONFIGURATION ---
const token = process.env.TELEGRAM_TOKEN || '8382264998:AAFtVA9PZcEIPdubBI-XrPFRqP3kc16diWA';
const ADMIN_ID = process.env.ADMIN_ID || '8296442213'; 

// ⚠️ ZAVA-DEHIBE: Omeo eto ny ID an'ny Groupe-nao (jereo ny fanazavana any ambany)
// Raha tsy fantatrao dia avelao ho NULL aloha, fa mila manoratra ao amin'ny groupe ianao vao mandeha.
let TARGET_GROUP_ID = process.env.GROUP_ID || null; 

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

// --- 2. SERVER EXPRESS (Keep-Alive) ---
const appServer = express();
const port = process.env.PORT || 3000;
appServer.get('/', (req, res) => res.send('Bot is Running...'));
appServer.listen(port, () => console.log(`Server listening on port ${port}`));

// --- 3. VARIABLES TEMPORAIRES ---
const userStates = {}; 
const jobCache = {};   

// --- 4. GESTION DU GROUPE (Welcome & Anti-Scam) ---

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const type = msg.chat.type;
    const text = msg.text;

    // Raha hafatra avy ao amin'ny GROUPE
    if (type === 'group' || type === 'supergroup') {
        
        // Raha mbola tsy misy ID ny groupe dia raisina eto
        if (!TARGET_GROUP_ID) {
            TARGET_GROUP_ID = chatId;
            console.log("Group ID detecté:", TARGET_GROUP_ID);
        }

        // A. Welcome Message
        if (msg.new_chat_members) {
            msg.new_chat_members.forEach((member) => {
                if (!member.is_bot) {
                    const welcomeMsg = `
👋 **Tonga soa ${member.first_name}!**

Ity groupe ity dia natokana hizara asa matotra (Microtache, Crypto, sns).
⚠️ **FEPETRA:** Mila PREUVE DE PAIEMENT daholo ny asa zaraina.

👇 **Tsindrio eto raha hizara asa:**
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

        // B. Anti-Scam (ohatra: > 4% par jour)
        if (text) {
            const scamRegex = /(\d+)\s*%\s*(par jour|daily|journalier)/i;
            const match = text.match(scamRegex);
            
            if (match && parseFloat(match[1]) > 4) {
                bot.deleteMessage(chatId, msg.message_id).catch(() => {});
                bot.sendMessage(chatId, `⚠️ **Message voafafa:** Ahiana ho Scam (Tombony be loatra).`);
            }
        }
    }
});

// --- 5. PRIVATE CHAT (Fandraisana ny Asa) ---

bot.onText(/\/start(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const param = match[1];

    if (msg.chat.type !== 'private') return;

    // Menu Principal
    if (!param) {
        bot.sendMessage(chatId, "🤖 **Menu Principal**\nInona no tianao hatao?", {
            reply_markup: {
                inline_keyboard: [[{ text: '📝 Hametraka Asa (Publier)', callback_data: 'start_publier' }]]
            }
        });
        return;
    }

    if (param === 'publier') startJobPosting(chatId);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    if (query.data === 'start_publier') {
        bot.answerCallbackQuery(query.id);
        startJobPosting(chatId);
    }
});

function startJobPosting(chatId) {
    userStates[chatId] = { step: 'ASK_DESC' };
    bot.sendMessage(chatId, "📝 **Dingana 1/3**\n\nAlefaso ny **DESCRIPTION** ny asa (sorato daholo ny detail):");
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!userStates[chatId] || msg.chat.type !== 'private') return;
    const state = userStates[chatId];

    // 1. Description
    if (state.step === 'ASK_DESC' && text && !text.startsWith('/')) {
        state.description = text;
        state.step = 'ASK_LINK';
        bot.sendMessage(chatId, "🔗 **Dingana 2/3**\n\nAlefaso ny **LIEN** (http://...):");
        return;
    }

    // 2. Lien
    if (state.step === 'ASK_LINK' && text) {
        if (!text.startsWith('http')) {
            bot.sendMessage(chatId, "⚠️ Mila manomboka amin'ny http:// na https:// ny lien.");
            return;
        }
        state.link = text;
        state.step = 'ASK_PROOFS';
        bot.sendMessage(chatId, "📸 **Dingana 3/3**\n\nAlefaso ny sary POROFO (Preuve de retrait). \n*Alefaso indray miaraka raha maromaro.*");
        return;
    }

    // 3. Sary (Proofs)
    if (state.step === 'ASK_PROOFS' && msg.photo) {
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        if (!state.proofs) state.proofs = [];
        state.proofs.push(photoId);

        // Manome fotoana kely raha handefa sary maro
        if (!state.timer) {
            state.timer = setTimeout(async () => {
                bot.sendMessage(chatId, "✅ **Voaray ny asanao!**\nAlefa any amin'ny Admin mba ho hamarinina. Ho hitanao ao amin'ny groupe rehefa mivoaka.");
                
                // Save DB
                try {
                    await addDoc(collection(db, "jobs"), {
                        userId: msg.from.id,
                        username: msg.from.username || "Inconnu",
                        description: state.description,
                        link: state.link,
                        status: 'pending',
                        timestamp: new Date()
                    });
                } catch (e) { console.error(e); }

                // Send to Admin
                sendToAdmin(chatId, state, msg.from);
                
                delete userStates[chatId];
            }, 2000); // Miandry 2 segondra sao misy sary hafa
        }
    }
});

// --- 6. ADMIN & PUBLICATION ---

async function sendToAdmin(userId, jobData, userInfo) {
    const caption = `🆕 **VALIDATION**\n👤 @${userInfo.username}\n\n📝 ${jobData.description}\n\n🔗 ${jobData.link}`;
    
    // Alefa any amin'ny Admin
    if (jobData.proofs.length > 0) {
        await bot.sendPhoto(ADMIN_ID, jobData.proofs[0], { caption: caption });
    } else {
        await bot.sendMessage(ADMIN_ID, caption);
    }

    jobCache[userId] = jobData;

    bot.sendMessage(ADMIN_ID, "Hetsika:", {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Valider (Publier)', callback_data: `approve_${userId}` }],
                [{ text: '❌ Refuser', callback_data: `reject_${userId}` }]
            ]
        }
    });
}

// Gestion Boutons Admin
bot.on('callback_query', async (query) => {
    const action = query.data;
    const msg = query.message;
    
    // Raha tsy admin dia miala
    if (msg.chat.id.toString() !== ADMIN_ID.toString()) return;

    if (action.startsWith('approve_')) {
        const targetId = action.split('_')[1];
        const job = jobCache[targetId];

        if (job) {
            // 1. Alefa any amin'ny User
            bot.sendMessage(targetId, "✅ **Asa nekena!** Efa navoaka ao amin'ny groupe.");

            // 2. Alefa any amin'ny GROUPE
            if (TARGET_GROUP_ID) {
                const groupCaption = `
💼 **ASA VAOVAO!**

${job.description}

✅ **Preuve:** Verified
👇 Midira eto:
                `;
                const groupOpts = {
                    caption: groupCaption,
                    reply_markup: {
                        inline_keyboard: [[{ text: '🚀 S\'inscrire', url: job.link }]]
                    }
                };
                
                await bot.sendPhoto(TARGET_GROUP_ID, job.proofs[0], groupOpts)
                    .then(() => bot.sendMessage(ADMIN_ID, "✅ Voa-publié."))
                    .catch((err) => bot.sendMessage(ADMIN_ID, "⚠️ Erreur publication: " + err.message));
            } else {
                bot.sendMessage(ADMIN_ID, "⚠️ **Tsy hita ny Group ID.** Manorata kely ao amin'ny groupe dia avereno validena.");
            }
            delete jobCache[targetId];
        }
    }

    if (action.startsWith('reject_')) {
        const targetId = action.split('_')[1];
        bot.sendMessage(targetId, "❌ **Nolavina.** Tsy ampy ny fepetra.");
        bot.answerCallbackQuery(query.id, { text: 'Nolavina' });
        delete jobCache[targetId];
    }
});
