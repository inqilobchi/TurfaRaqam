require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const axios = require('axios');
const Fastify = require('fastify');
const fastify = Fastify({ logger: true });
const adminId = process.env.ADMIN_ID;
const payState = {};
const adminState = {};
const activations = new Map();
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { webHook: true });

const WEBHOOK_PATH = `/webhook/${token}`;
const FULL_WEBHOOK_URL = `${process.env.PUBLIC_URL}${WEBHOOK_PATH}`;


fastify.post(WEBHOOK_PATH, (req, reply) => {
  try {
    bot.processUpdate(req.body);  
    console.log('Update processed:', req.body);
    reply.code(200).send();       
  } catch (error) {
    console.error('Error processing update:', error);
    reply.sendStatus(500);
  }
});

fastify.get('/healthz', (req, reply) => {
  reply.send({ status: 'ok' });
});

fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' }, async (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  fastify.log.info(`Server listening at ${address}`);

  try {
const response = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, null, {
  params: { url: FULL_WEBHOOK_URL }
});

    if (response.data.ok) {
      fastify.log.info('Webhook successfully set:', response.data);
    } else {
      fastify.log.error('Failed to set webhook:', response.data);
    }
  } catch (error) {
    fastify.log.error('Error setting webhook:', error.message);
  }
});
mongoose.connect(process.env.MONGO_URI);

const UserSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  name: String,
  username: String,
  balance: { type: Number, default: 0 },
  referalcount: { type: Number, default: 0 },
  referallink: String
});
const User = mongoose.model('User', UserSchema);

bot.getMe().then((botInfo) => {
  bot.me = botInfo;
  console.log(`🤖 Bot ishga tushdi: @${bot.me.username}`);
}).catch((err) => {
  console.error("Bot ma'lumotini olishda xatolik:", err.message);
});
require('./admin.js')(bot, User, adminId, adminState);
const REQUIRED_CHANNELS = (process.env.REQUIRED_CHANNELS || '').split(',').map(ch => ch.trim()).filter(Boolean);

const tempReferrers = new Map();

const apiKey = process.env.API_KEY;

const countries = {
  "🇺🇿 Uzbekistan":   { code: 0,   price: 10060,  providerIds: null },
  "🇰🇪 Kenya":        { code: 8,   price: 5260,  providerIds: null },
  "🇮🇩 Indonesia":    { code: 6,   price: 5920,  providerIds: null },
  "🇵🇰 Pakistan":     { code: 66,  price: 6500,  providerIds: null },
  "🇵🇭 Philippines":  { code: 4,   price: 7250,  providerIds: null },
  "🇺🇸 USA":          { code: 12,  price: 7800,  providerIds: null }
};
const menu = [
  [{ text: "📞Raqam olish🛍" }],
  [{ text: "👤Hisobim" }, { text: "💳Pul kiritish" }],
  [{ text: "📍Admin" }, { text: "📄Bot haqida" }]
];

async function getNumber(service, country, maxPrice, providerIds) {
  let url =
    `https://api.grizzlysms.com/stubs/handler_api.php?api_key=${apiKey}` +
    `&action=getNumber&service=${service}&country=${country}&maxPrice=${maxPrice}`;

  if (providerIds) url += `&providerIds=${providerIds}`;

  const res = await axios.get(url).catch(() => ({ data: "API_ERROR" }));

  return res.data;
}

async function setStatus(id, status) {
  const url = `https://api.grizzlysms.com/stubs/handler_api.php?api_key=${apiKey}&action=setStatus&status=${status}&id=${id}`;
  const res = await axios.get(url).catch(() => ({ data: "API_ERROR" }));
  return res.data;
}

async function getStatus(id) {
  const url = `https://api.grizzlysms.com/stubs/handler_api.php?api_key=${apiKey}&action=getStatus&id=${id}`;
  const res = await axios.get(url).catch(() => ({ data: "API_ERROR" }));
  return res.data;
}


async function isUserSubscribed(userId) {
  if (!REQUIRED_CHANNELS.length) return true; 

  for (const channel of REQUIRED_CHANNELS) {
    try {
      const res = await bot.getChatMember(channel, userId);
      if (!['member', 'creator', 'administrator'].includes(res.status)) {
        return false; 
      }
    } catch (err) {
      console.error(`Obuna tekshirishda xatolik [${channel}]:`, err.message);
      return false;
    }
  }

  return true;
}

async function getSubscriptionMessage() {
  const buttons = [];

  for (const channel of REQUIRED_CHANNELS) {
    try {
      const chat = await bot.getChat(channel);
      const title = chat.title || channel;
      const channelLink = `https://t.me/${channel.replace('@', '')}`;
      buttons.push([{ text: `${title}`, url: channelLink }]);
    } catch (err) {
      console.error(`Kanal nomini olishda xatolik: ${channel}`, err.message);
      buttons.push([{ text: `${channel}`, url: `https://t.me/${channel.replace('@', '')}` }]);
    }
  } 
  buttons.push([{ text: '✅ Obuna bo‘ldim', callback_data: 'check_subscription' }]);

  return {
    text: `<b>❗ Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:</b>`,
    options: {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: buttons
      }
    }
  };
}

bot.on('message', async (msg) => {
  const chatId = msg.from.id;
  const name = msg.from.first_name;
  if (msg.text === "Bekor qilish") {
    if (payState[chatId]) {
      delete payState[chatId];
      return bot.sendMessage(chatId, `<b>Siz asosiy menyudasiz🎈</b>`, {
        parse_mode: 'HTML',
        reply_markup: { keyboard: menu, resize_keyboard: true, one_time_keyboard: false }
      });
    } else {
        bot.sendMessage(chatId, `<b>Siz asosiy menyudasiz🎈</b>`, {
        parse_mode: 'HTML',
        reply_markup: { keyboard: menu, resize_keyboard: true, one_time_keyboard: false }
      });
    }
  }
  if (msg.text === '/start') {
    const args = msg.text.split(' ');
    const referrerId = args[1] ? parseInt(args[1]) : null;
    if (referrerId) {
      tempReferrers.set(chatId, referrerId);
    }

    if (!(await isUserSubscribed(chatId))) {
      const sub = await getSubscriptionMessage();
      return bot.sendMessage(chatId, sub.text, sub.options);
    }

    let user = await User.findOne({ id: chatId });
    if (!user) {
      user = new User({
        id: chatId,
        name: msg.from.first_name,
        username: msg.from.username,
        referallink: `https://t.me/${bot.me.username}?start=${chatId}`
      });
      await user.save();

      // If referrer exists, add bonus to referrer and notify both
      if (referrerId && referrerId !== chatId) {  // Prevent self-referral
        const referrer = await User.findOne({ id: referrerId });
        if (referrer) {
          referrer.balance += 80;  // Referral bonus 80 so'm
          referrer.referalcount += 1;
          await referrer.save();

          // Xabar referrer ga
          bot.sendMessage(referrerId, `<b>🎉 Sizga yangi referal qo'shildi!</b>\n<a href='tg://user?id=${chatId}'>👤Ro'yxatdan o'tdi : ${chatId}</a> `, {parse_mode : 'HTML'});

          // Xabar yangi foydalanuvchiga
          bot.sendMessage(chatId, `<b>🎉 Tabriklaymiz! Siz referal orqali ro'yxatdan o'tdingiz va referrer ga bonus berildi!</b>`, {parse_mode : 'HTML'});
        }
      }
    }

    await bot.sendMessage(chatId, `<b>Siz asosiy menyudasiz🎈</b>`, {
      parse_mode: 'HTML',
      reply_markup: { keyboard: menu, resize_keyboard: true, one_time_keyboard: false }
    });
  } else if (msg.text === "📞Raqam olish🛍") {
    // Obuna tekshiruvi
    if (!(await isUserSubscribed(chatId))) {
      const sub = await getSubscriptionMessage();
      return bot.sendMessage(chatId, sub.text, sub.options);
    }

    // Create inline keyboard for countries
    const countryKeyboard = [];
    for (let country in countries) {
      countryKeyboard.push([{ text: `${country} - ${countries[country].price} so'm`, callback_data: `select_country_${country}` }]);
    }
    await bot.sendMessage(chatId, 'Davlatni tanlang:', {
      reply_markup: { inline_keyboard: countryKeyboard }
    });
  } else if (msg.text === "👤Hisobim") {
    // Obuna tekshiruvi
    if (!(await isUserSubscribed(chatId))) {
      const sub = await getSubscriptionMessage();
      return bot.sendMessage(chatId, sub.text, sub.options);
    }

    const user = await User.findOne({ id: chatId });
    if (user) {
      await bot.sendMessage(chatId, `﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌\n<b>🆔 Sizning ID raqamingiz : <code>${user.id}</code></b>\n<b>🔥 Sizning balansingiz: ${user.balance} so'm</b>\n<b>🔗 Referal havolangiz : <code>${user.referallink}</code></b>\n<b>👥 Taklif qilgansiz : ${user.referalcount} ta</b>\n\n﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌`, { parse_mode: 'HTML' });
    } else {
      await bot.sendMessage(chatId, 'Foydalanuvchi topilmadi.');
    }
  } else if (msg.text === "💳Pul kiritish") {
    if (!(await isUserSubscribed(chatId))) {
      const sub = await getSubscriptionMessage();
      return bot.sendMessage(chatId, sub.text, sub.options);
    }

    await bot.sendMessage(chatId, `<b>💡 To'lov turini tanlang ⬇️:</b>`, {
      parse_mode : 'HTML', 
      reply_markup : {
        inline_keyboard : [[{text : "💳 Kartaga to'lov", callback_data : 'click_pay'}]]
      }
    });
  }   if (payState[chatId]?.step === 'amount') {
    const amount = parseInt(msg.text);
    if (isNaN(amount) || amount < 5000 || amount > 50000) {
      return bot.sendMessage(chatId, `<b>❌ Iltimos, 5000 - 50000 so'm orasida miqdor kiriting!</b>`, {
        parse_mode : 'HTML',
        reply_markup : { keyboard : [[{text : "Bekor qilish"}]], resize_keyboard : true}
      });
    }
    payState[chatId].amount = amount;
    payState[chatId].step = 'photo';
    return bot.sendMessage(chatId, `<b>📸 Iltimos, to'lov chekining suratini yuboring (faqat rasm)!</b>`, {
      parse_mode : 'HTML',
    });
  }

  if (payState[chatId]?.step === 'photo' && msg.photo) {
    const fileId = msg.photo[msg.photo.length - 1].file_id; 
    const amount = payState[chatId].amount;

    await bot.sendMessage(chatId, `✅ To'lov so'rovingiz qabul qilindi. Admin tekshiradi.`);

    await bot.sendPhoto(adminId, fileId, {
      caption: `💰 To'lov miqdori: ${amount} so'm\nFoydalanuvchi: ${name} (ID: ${chatId})`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Tasdiqlash", callback_data: `pay_accept_${chatId}_${amount}` },
            { text: "❌ Bekor qilish", callback_data: `pay_cancel_${chatId}_${amount}` }
          ]
        ]
      }
    });

    delete payState[chatId];
  } else if (payState[chatId]?.step === 'photo' && !msg.photo) {
    return bot.sendMessage(chatId, "❌ Iltimos, faqat rasm yuboring.");
  }else if (msg.text === "📍Admin") {
    if (!(await isUserSubscribed(chatId))) {
      const sub = await getSubscriptionMessage();
      return bot.sendMessage(chatId, sub.text, sub.options);
    }

    await bot.sendMessage(chatId, `<b>Dasturchi : @inqiIob</b>\n\n<i>Savol yoki muammo bo'lsa bemalol yozing!</i>`, {
      parse_mode : 'HTML'
    });
  } else if (msg.text === "📄Bot haqida") {
    if (!(await isUserSubscribed(chatId))) {
      const sub = await getSubscriptionMessage();
      return bot.sendMessage(chatId, sub.text, sub.options);
    }

    await bot.sendMessage(chatId, `<b>Bu bot virtual raqamlar sotish uchun.</b>\n<b>Shunaqa bot kerak bo'lsa : @inqiIob ga yozing</b>`, {
      parse_mode : 'HTML'
    });
  } 
});

bot.on('callback_query', async (query) => {
  const chatId = query.from.id;
  const data = query.data;
  const messageId = query.message.message_id;
    if (data === 'click_pay') {
    payState[query.from.id] = { step: 'amount' };
    return bot.sendMessage(query.from.id, `<b>💳Karta raqam : 9860 1201 6718 6416</b>\n<b>💰Iltimos, kiritmoqchi bo'lgan miqdorini yozing</b>\n<b>(min: 5000, max: 50000):</b>`, {
      parse_mode : 'HTML',
      reply_markup : { keyboard : [[{text : "Bekor qilish"}]], resize_keyboard : true}
    });
  }

  if (data.startsWith('pay_accept_') || data.startsWith('pay_cancel_')) {
    const parts = data.split('_');
    const action = parts[1]; 
    const userId = parseInt(parts[2]);
    const amount = parseInt(parts[3]);

    if (action === 'accept') {
      const user = await User.findOne({ id: userId });
      if (user) {
        user.balance += amount;
        await user.save();
        await bot.sendMessage(userId, `✅ Sizning hisobingizga ${amount} so'm qo'shildi!`);
        await bot.editMessageCaption(`💰 To'lov miqdori: ${amount} so'm\nFoydalanuvchi: ${user.name} (ID: ${user.id})\n✅ Tasdiqlandi`, {
          chat_id: chatId,
          message_id: messageId
        });
      }
    } else if (action === 'cancel') {
      await bot.sendMessage(userId, `❌ To'lov bekor qilindi.`);
      await bot.editMessageCaption(`💰 To'lov miqdori: ${amount} so'm\nFoydalanuvchi ID: ${userId}\n❌ Bekor qilindi`, {
        chat_id: chatId,
        message_id: messageId
      });
    }

    await bot.answerCallbackQuery(query.id);
  }
  if (data === 'check_subscription') {
    if (await isUserSubscribed(chatId)) {
      let user = await User.findOne({ id: chatId });
      if (!user) {
        user = new User({
          id: chatId,
          name: query.from.first_name,
          username: query.from.username,
          referallink: `https://t.me/${bot.me.username}?start=${chatId}`
        });
        await user.save();

        const referrerId = tempReferrers.get(chatId);
        if (referrerId && referrerId !== chatId) {
          const referrer = await User.findOne({ id: referrerId });
          if (referrer) {
            referrer.balance += 80;  
            referrer.referalcount += 1;
            await referrer.save();

            bot.sendMessage(referrerId, `<b>🎉 Sizga yangi referal qo'shildi!</b>\n<a href='tg://user?id=${chatId}'>👤Ro'yxatdan o'tdi : ${chatId}</a> `, {parse_mode : 'HTML'});

            bot.sendMessage(chatId, `<b>🎉 Tabriklaymiz! Siz referal orqali ro'yxatdan o'tdingiz va referrer ga bonus berildi!</b>`, {parse_mode : 'HTML'});
          }
        }
        tempReferrers.delete(chatId);
      }

      await bot.sendMessage(chatId, '✅ Obuna tasdiqlandi!', {
        reply_markup: { keyboard: menu, resize_keyboard: true, one_time_keyboard: false }
      });
    } else {
      const sub = await getSubscriptionMessage();
      return bot.sendMessage(chatId, sub.text, sub.options);
    }
    bot.answerCallbackQuery(query.id);
  } else if (data.startsWith('select_country_')) {

  if (!(await isUserSubscribed(chatId))) {
    const sub = await getSubscriptionMessage();
    return bot.sendMessage(chatId, sub.text, sub.options);
  }

  await bot.answerCallbackQuery(query.id, {
    text: "⏳ Raqam olinmoqda...",
    show_alert: false
  });

  const country = data.split('select_country_')[1];
  const service = "tg";

  const countryData = countries[country];
  const price = countryData.price;
  const countryCode = countryData.code;
  const providerIds = countryData.providerIds;

  let user = await User.findOne({ id: chatId });
  if (!user) return;

  if (user.balance < price) {
    return bot.sendMessage(chatId, "❌ Balansingiz yetarli emas!");
  }

  const res = await getNumber(service, countryCode, price, providerIds);

  if (!res.startsWith("ACCESS_NUMBER")) {
    return bot.sendMessage(chatId, "❌ Raqam mavjud emas, boshqa davlat tanlang.");
  }

  const parts = res.split(":");
  const activationId = parts[1];
  const number = parts[2];

  user.balance -= price;
  await user.save();

  activations.set(chatId, {
    id: activationId,
    number,
    time: Date.now(),
    checking: false,
    country: country 
  });

  bot.sendMessage(
    chatId,
    `📞 <b>Raqam olindi!</b>\n\n📱 Raqam: <code>${number}</code>\n\n👇 SMS kodni olish yoki bekor qilish uchun tugmalardan foydalaning.`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📩 SMS kodni olish", callback_data: "get_sms_code" }],
          [{ text: "❌ Bekor qilish", callback_data: "cancel_activation" }]
        ]
      }
    }
  );

  bot.answerCallbackQuery(query.id);
} else if (data === "get_sms_code") {

    const act = activations.get(chatId);
    if (!act) return bot.answerCallbackQuery(query.id, { text: "❗ Aktivatsiya topilmadi" });

    await bot.answerCallbackQuery(query.id, { text: "⏳ SMS kutilmoqda..." });

    await setStatus(act.id, 1);

    if (act.checking) return; 
    act.checking = true;

    const interval = setInterval(async () => {
      const status = await getStatus(act.id);

      if (status.startsWith("STATUS_OK")) {
        const code = status.split(":")[1];

        clearInterval(interval);
        activations.delete(chatId);

        return bot.sendMessage(
          chatId,
          `✅ <b>Kod olindi!</b>\n\n🔐 Sizning SMS kodingiz: <code>${code}</code>`,
          { parse_mode: "HTML" }
        );
      }

      if (status === "STATUS_CANCEL") {
        clearInterval(interval);
        activations.delete(chatId);
        return bot.sendMessage(chatId, "❌ Aktivatsiya bekor qilindi.");
      }

    }, 4000);
} else if (data === "cancel_activation") {

    const act = activations.get(chatId);
    if (!act) return bot.answerCallbackQuery(query.id, { text: "❗ Aktivatsiya yo‘q" });

    const passed = (Date.now() - act.time) / 1000;

    if (passed < 180) {
      return bot.answerCallbackQuery(query.id, {
        text: `⏳ Bekor qilish faqat 3 daqiqadan keyin mumkin (${180 - Math.floor(passed)}s qoldi)`,
        show_alert: true
      });
    }

    await setStatus(act.id, -1);
      const user = await User.findOne({ id: chatId });
      if (user) {
        const price = countries[act.country].price;
        user.balance += price;
        await user.save();
        bot.sendMessage(chatId, `✅ Aktivatsiya bekor qilindi va ${price} so'm balansingizga qaytarildi.`);
      }
    activations.delete(chatId);

    bot.answerCallbackQuery(query.id, { text: "❌ Aktivatsiya bekor qilindi!" });

    bot.sendMessage(chatId, "❌ Aktivatsiya muvaffaqiyatli bekor qilindi.");
}
 else {
    bot.answerCallbackQuery(query.id);
  }
});
