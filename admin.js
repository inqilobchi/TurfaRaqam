module.exports = (bot, User, adminId, adminState) => {
  // /panel buyrug'i faqat admin uchun
  bot.on('message', async (msg) => {
    const chatId = msg.from.id;
    if (msg.text === '/panel' && chatId == adminId) {
      try {
        const totalUsers = await User.countDocuments();

        const topUsers = await User.find().sort({ balance: -1 }).limit(5);

        let text = `<b>📊 Admin Panel</b>\n\n`;
        text += `<b>👥 Umumiy foydalanuvchilar: ${totalUsers}</b>\n\n`;
        text += `<b>🏆 TOP 5 Balans:</b>\n`;

        const inlineKeyboard = [];
        topUsers.forEach((user, index) => {
          text += `${index + 1}. ${user.name} (ID: ${user.id}) - ${user.balance} so'm\n`;
          inlineKeyboard.push([
            { text: `➕ Pul qo'shish (${user.id})`, callback_data: `add_balance_${user.id}` },
            { text: `➖ Pul ayirish (${user.id})`, callback_data: `subtract_balance_${user.id}` }
          ]);
        });

        inlineKeyboard.push([{ text: '🔍 Foydalanuvchi qidirish', callback_data: 'search_user' }]);

        await bot.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: inlineKeyboard }
        });
      } catch (err) {
        console.error('Admin panel xatolik:', err);
        await bot.sendMessage(chatId, '❌ Xatolik yuz berdi.');
      }
    }

    // Admin state uchun miqdor so'rash (mavjud)
    if (adminState[chatId]?.step === 'amount') {
      const amount = parseInt(msg.text);
      if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(chatId, '❌ Iltimos, musbat son kiriting.');
      }
      adminState[chatId].amount = amount;
      adminState[chatId].step = 'confirm';
      const actionText = adminState[chatId].action === 'add' ? "qo'shish" : 'ayirish';
      return bot.sendMessage(chatId, `<b>💰 ${amount} so'm ${actionText}ni tasdiqlaysizmi?</b>`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Tasdiqlash', callback_data: 'confirm_admin_action' }],
            [{ text: '❌ Bekor qilish', callback_data: 'cancel_admin_action' }]
          ]
        }
      });
    }

    // Yangi: Foydalanuvchi ID so'rash
    if (adminState[chatId]?.step === 'user_id') {
      const userId = parseInt(msg.text);
      if (isNaN(userId)) {
        return bot.sendMessage(chatId, '❌ Iltimos, to\'g\'ri ID kiriting (raqam).');
      }
      const user = await User.findOne({ id: userId });
      if (!user) {
        return bot.sendMessage(chatId, '❌ Bunday foydalanuvchi topilmadi.');
      }
      adminState[chatId].userId = userId;
      adminState[chatId].step = 'choose_action';
      return bot.sendMessage(chatId, `<b>👤 Foydalanuvchi: ${user.name} (ID: ${user.id}) - Balans: ${user.balance} so'm</b>\n\nNima qilmoqchisiz?`, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '➕ Pul qo\'shish', callback_data: 'choose_add' }],
            [{ text: '➖ Pul ayirish', callback_data: 'choose_subtract' }]
          ]
        }
      });
    }
  });

  // Callback query handler
  bot.on('callback_query', async (query) => {
    const chatId = query.from.id;
    const data = query.data;

    if (data.startsWith('add_balance_') || data.startsWith('subtract_balance_')) {
      // Mavjud kod (TOP 5 uchun)
      const action = data.startsWith('add_balance_') ? 'add' : 'subtract';
      const userId = parseInt(data.split('_')[2]);

      adminState[chatId] = { action, userId, step: 'amount' };
      await bot.sendMessage(chatId, `<b>💰 ${action === 'add' ? "Qo'shish" : 'Ayirish'} uchun miqdor kiriting (so'm):</b>`, {
        parse_mode: 'HTML'
      });
      await bot.answerCallbackQuery(query.id);
    } else if (data === 'search_user') {
      // Yangi: Foydalanuvchi qidirish
      adminState[chatId] = { step: 'user_id' };
      await bot.sendMessage(chatId, '<b>🔍 Foydalanuvchi ID sini kiriting:</b>', {
        parse_mode: 'HTML'
      });
      await bot.answerCallbackQuery(query.id);
    } else if (data === 'choose_add' || data === 'choose_subtract') {
      // Yangi: Action tanlash
      const action = data === 'choose_add' ? 'add' : 'subtract';
      adminState[chatId].action = action;
      adminState[chatId].step = 'amount';
      await bot.sendMessage(chatId, `<b>💰 ${action === 'add' ? "Qo'shish" : 'Ayirish'} uchun miqdor kiriting (so'm):</b>`, {
        parse_mode: 'HTML'
      });
      await bot.answerCallbackQuery(query.id);
    } else if (data === 'confirm_admin_action') {
      // Mavjud kod (tasdiqlash)
      const state = adminState[chatId];
      if (!state) return;

      const user = await User.findOne({ id: state.userId });
      if (!user) {
        await bot.sendMessage(chatId, '❌ Foydalanuvchi topilmadi.');
        delete adminState[chatId];
        return;
      }

      if (state.action === 'add') {
        user.balance += state.amount;
      } else if (state.action === 'subtract') {
        user.balance = Math.max(0, user.balance - state.amount); // Balans 0 dan pastga tushmasin
      }
      await user.save();

      await bot.sendMessage(chatId, `✅ ${state.amount} so'm ${state.action === 'add' ? "qo'shildi" : 'ayirildi'}. Yangi balans: ${user.balance} so'm`);
      await bot.sendMessage(state.userId, `💰 Admin sizning balansingizga ${state.amount} so'm ${state.action === 'add' ? "qo'shdi" : 'ayirdi'}. Yangi balans: ${user.balance} so'm`);

      delete adminState[chatId];
      await bot.answerCallbackQuery(query.id);
    } else if (data === 'cancel_admin_action') {
      // Mavjud kod (bekor qilish)
      delete adminState[chatId];
      await bot.sendMessage(chatId, '❌ Bekor qilindi.');
      await bot.answerCallbackQuery(query.id);
    }
  });
};
