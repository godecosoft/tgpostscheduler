const TelegramBot = require('node-telegram-bot-api');
const { db } = require('./db');
const { fixTelegramHtml } = require('./utils/htmlSanitize');

let bot = null;
let botInfo = null;

function init() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.startsWith('123456')) {
    console.warn('[bot] TELEGRAM_BOT_TOKEN ayarlanmamış — bot devre dışı');
    return null;
  }
  // allowed_updates: reaction event'lerini almak için açıkça istemek gerek
  bot = new TelegramBot(token, {
    polling: {
      params: {
        allowed_updates: JSON.stringify([
          'message',
          'edited_message',
          'channel_post',
          'edited_channel_post',
          'my_chat_member',
          'message_reaction',
          'message_reaction_count',
        ]),
      },
    },
  });

  bot.getMe().then((me) => {
    botInfo = me;
    console.log(`[bot] @${me.username} bağlandı`);
  });

  // Bir kanala bot ekleyince otomatik olarak DB'ye kaydet
  bot.on('my_chat_member', (update) => {
    const chat = update.chat;
    const newStatus = update.new_chat_member?.status;
    if (!['channel', 'supergroup', 'group'].includes(chat.type)) return;
    if (!['administrator', 'member'].includes(newStatus)) return;
    upsertChannel(chat);
  });

  // Kanala düşen her post ile de kaydet — my_chat_member kaçırılsa bile
  // (bot deploy sırasında offline'ken admin yapıldıysa event gelmez).
  // Kanala tek bir mesaj atmak kaydı garantiye alır.
  bot.on('channel_post', (msg) => {
    if (msg.chat?.type === 'channel') upsertChannel(msg.chat);
  });

  // /start ve /id komutları — bulunduğun chat'in id'sini ver
  bot.onText(/\/(start|id|help)/, (msg) => {
    const lines = [
      '👋 <b>ARS Telegram Scheduler Bot</b>',
      '',
      `📍 Bu sohbetin Chat ID'si: <code>${msg.chat.id}</code>`,
      `Tür: <code>${msg.chat.type}</code>`,
      msg.chat.title ? `İsim: ${escapeHtml(msg.chat.title)}` : '',
      '',
      '📡 <b>Kanal chat_id öğrenmek için:</b>',
      '1️⃣ Botu kanalına yönetici olarak ekle (otomatik kayıtlanır)',
      '2️⃣ <b>VEYA</b> kanalından bir mesajı bana <i>ilet</i> (forward), sana ID\'sini yazayım',
      '',
      '✨ <b>Premium Emoji ID öğrenmek için:</b>',
      'Custom emoji içeren bir mesajı bana yaz/ilet, içindeki emoji ID\'lerini sana çıkarayım.',
    ].filter(Boolean).join('\n');
    bot.sendMessage(msg.chat.id, lines, { parse_mode: 'HTML' });
  });

  // İletilen (forwarded) mesajları yakala — kaynak kanalın chat_id'sini ver
  bot.on('message', (msg) => {
    // Komut ise atla — yukarıda zaten işlendi
    if (msg.text && /^\/(start|id|help|emoji)\b/.test(msg.text)) return;

    // Custom (premium) emoji ID'lerini çıkar — text/caption entity'lerini tara
    const entities = msg.entities || msg.caption_entities || [];
    const text = msg.text || msg.caption || '';
    const customEmojis = entities
      .filter((e) => e.type === 'custom_emoji' && e.custom_emoji_id)
      .map((e) => ({
        id: e.custom_emoji_id,
        fallback: text.substring(e.offset, e.offset + e.length),
      }));

    // Bot API'nin eski (forward_from_chat) ve yeni (forward_origin) alanlarını kontrol et
    const fwdChat = msg.forward_from_chat || msg.forward_origin?.chat || null;
    const fwdUser = msg.forward_from || msg.forward_origin?.sender_user || null;

    // ÖNCELİK: iletilen mesaj bir kanal/gruptan geldiyse HER ZAMAN önce kanal ID'sini ver.
    // (Emoji kontrolünden önce olmalı — yoksa premium emoji içeren kanal postu
    //  iletildiğinde bot kanal ID yerine emoji ID gösterirdi.)
    if (fwdChat) {
      const lines = [
        '✅ <b>İletilen mesajın kaynağı bulundu</b>',
        '',
        `📡 Chat ID: <code>${fwdChat.id}</code>`,
        `Tür: <code>${fwdChat.type}</code>`,
        fwdChat.title ? `İsim: ${escapeHtml(fwdChat.title)}` : '',
        fwdChat.username ? `Kullanıcı adı: @${fwdChat.username}` : '',
        '',
        '👉 Bu ID\'yi web panelde "Kanallar → Yeni Kanal" ekranına yapıştırabilirsin.',
        '',
        '<i>Not: Botu da kanalın yöneticisi olarak eklemeyi unutma — yoksa mesaj gönderemez.</i>',
        customEmojis.length > 0
          ? `\n✨ <i>Bu mesajda ${customEmojis.length} premium emoji de var. ID'leri için mesajı buraya (forward değil) düz kopyalayıp gönder.</i>`
          : '',
      ].filter(Boolean).join('\n');
      bot.sendMessage(msg.chat.id, lines, { parse_mode: 'HTML' });
      return;
    }

    if (customEmojis.length > 0 && msg.chat.type === 'private') {
      const lines = [
        `✨ <b>${customEmojis.length} adet Premium Emoji bulundu</b>`,
        '',
        ...customEmojis.map(
          (ce, i) =>
            `${i + 1}. ${ce.fallback}  <code>${ce.id}</code>\n` +
            `   <code>&lt;tg-emoji emoji-id="${ce.id}"&gt;${escapeHtml(ce.fallback)}&lt;/tg-emoji&gt;</code>`,
        ),
        '',
        '👉 Web panelde "Premium Emoji Ekle" butonuna tıklayıp ID\'yi yapıştır.',
        '<i>Not: Premium olmayan kullanıcılar fallback (parantez içindeki standart emoji)yi görür.</i>',
      ].join('\n');
      bot.sendMessage(msg.chat.id, lines, { parse_mode: 'HTML' });
      return;
    }

    if (fwdUser && msg.chat.type === 'private') {
      bot.sendMessage(
        msg.chat.id,
        `👤 İletilen mesaj bir kullanıcıdan: <code>${fwdUser.id}</code>\n\nKanal chat_id öğrenmek istiyorsan, kanaldaki bir mesajı bana ilet.`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    // İletilen ama kaynağı GİZLİ mesaj (kanalın gizlilik/"içeriği koru" ayarı açık).
    // forward_origin var ama chat/sender_user yok → chat_id veremeyiz, açıkça söyle.
    const isForwarded = !!(msg.forward_origin || msg.forward_date || msg.forward_sender_name);
    if (isForwarded && msg.chat.type === 'private') {
      bot.sendMessage(
        msg.chat.id,
        '⚠️ Bu iletilen mesajın kaynağı <b>gizli</b> (kanal ayarlarında gönderen adı gizleniyor ya da içerik korumalı), bu yüzden chat_id okuyamıyorum.\n\n' +
          'Çözüm: Botu kanala <b>yönetici</b> olarak ekle — kanal otomatik olarak kaydedilir ve ID gerekmeden çalışır.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    // Özel sohbette herhangi bir mesaj geldiyse (forward değil) yardımcı yönlendirme
    if (msg.chat.type === 'private' && msg.text && !msg.text.startsWith('/')) {
      bot.sendMessage(
        msg.chat.id,
        '💡 Kanal ID\'si öğrenmek için kanalından <b>bir mesajı bana ilet (forward)</b>.\nBulunduğun sohbetin ID\'sini görmek için /id yaz.',
        { parse_mode: 'HTML' },
      );
    }
  });

  // --- Reaction tracking (Bot API 7+) ---
  // message_reaction_count: anonymous channel reactions için aggregate
  bot.on('message_reaction_count', (update) => {
    try {
      handleReactionUpdate(update);
    } catch (e) {
      console.error('[bot] reaction handler hata:', e.message);
    }
  });
  // message_reaction: bireysel kullanıcı reactionları (gruplar/non-anonymous)
  bot.on('message_reaction', (update) => {
    // Bireysel reaction'ları aggregate edip aynı handler'a yönlendir
    try {
      const reactions = update.new_reaction || [];
      const counts = {};
      for (const r of reactions) {
        const emoji = r.emoji || (r.type === 'custom_emoji' ? `✨${r.custom_emoji_id}` : null);
        if (emoji) counts[emoji] = (counts[emoji] || 0) + 1;
      }
      // Bireysel update'lerden tam aggregate elde edilemez; sadece reaction varlığını işaretle
      // Tam sayım için message_reaction_count daha doğru
      handleReactionUpdate({
        chat: update.chat,
        message_id: update.message_id,
        reactions: Object.entries(counts).map(([type, total]) => ({ type, total_count: total })),
      });
    } catch (e) {
      console.error('[bot] message_reaction hata:', e.message);
    }
  });

  return bot;
}

// Kanalı DB'ye ekle ya da adını/username'ini güncelle (idempotent)
function upsertChannel(chat) {
  const existing = db.prepare('SELECT id FROM channels WHERE chat_id = ?').get(String(chat.id));
  if (existing) {
    db.prepare('UPDATE channels SET name = ?, username = ? WHERE chat_id = ?').run(
      chat.title || chat.username || String(chat.id),
      chat.username || null,
      String(chat.id),
    );
  } else {
    db.prepare('INSERT INTO channels (name, chat_id, username, note) VALUES (?, ?, ?, ?)').run(
      chat.title || chat.username || String(chat.id),
      String(chat.id),
      chat.username || null,
      'Bot kanala eklendiğinde otomatik kaydedildi',
    );
    console.log(`[bot] Yeni kanal otomatik kaydedildi: ${chat.title} (${chat.id})`);
  }
}

function handleReactionUpdate(update) {
  const chatId = String(update.chat?.id);
  const messageId = update.message_id;
  if (!chatId || !messageId) return;

  // İlgili post'u bul
  const post = db
    .prepare(
      `SELECT p.id FROM posts p
       JOIN channels c ON c.id = p.channel_id
       WHERE c.chat_id = ? AND p.telegram_message_id = ?`,
    )
    .get(chatId, messageId);
  if (!post) return;

  // Reactions formatı: [{ type: 'emoji'|'custom_emoji', emoji?, custom_emoji_id?, total_count }]
  const list = update.reactions || [];
  const map = {};
  let total = 0;
  for (const r of list) {
    const key = r.type?.emoji || r.emoji || (r.type?.custom_emoji_id && `✨${r.type.custom_emoji_id}`) || '?';
    const count = r.total_count || 0;
    map[key] = (map[key] || 0) + count;
    total += count;
  }
  db.prepare(
    `UPDATE posts SET reactions = ?, last_stats_update = datetime('now') WHERE id = ?`,
  ).run(JSON.stringify(map), post.id);
  db.prepare(
    `INSERT INTO post_stats_history (post_id, views, reactions_total) VALUES (?, ?, ?)`,
  ).run(post.id, 0, total);
  console.log(`[bot] post #${post.id} reactions güncellendi (total=${total})`);
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getBot() {
  return bot;
}

function buildReplyMarkup(buttonsJson) {
  if (!buttonsJson) return undefined;
  let buttons;
  try {
    buttons = typeof buttonsJson === 'string' ? JSON.parse(buttonsJson) : buttonsJson;
  } catch {
    return undefined;
  }
  if (!Array.isArray(buttons) || buttons.length === 0) return undefined;
  // buttons formatı: [[{text, url}, {text, url}], [{text, url}]]
  return { inline_keyboard: buttons };
}

function resolveMediaPath(p) {
  const path = require('path');
  const fs = require('fs');
  const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
  // Geriye dönük uyum: eski kayıtlar 'uploads/xxx.jpg' formatında olabilir
  const filename = String(p).replace(/^uploads[\\/]/, '');
  const full = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(full)) throw new Error('Medya dosyası bulunamadı: ' + full);
  return full;
}

async function sendPost(post, channel) {
  if (!bot) throw new Error('Bot başlatılmamış (TELEGRAM_BOT_TOKEN eksik)');

  const fs = require('fs');

  // HTML balansını gönderim öncesi otomatik düzelt
  // (orphan </tag>'leri sil, kapanmamış <tag>'leri kapat)
  const safeText = post.parse_mode === 'HTML' || !post.parse_mode
    ? fixTelegramHtml(post.text || '').fixed
    : post.text || '';

  const opts = {
    parse_mode: post.parse_mode || 'HTML',
    disable_web_page_preview: !!post.disable_preview,
    disable_notification: !!post.silent,
    reply_markup: buildReplyMarkup(post.buttons),
  };

  // post.text yerine sterilize edilmiş metni kullan
  const sendableText = safeText;

  // 1) Media group / album
  if (post.media_type === 'media_group' && post.media_group) {
    let group;
    try {
      group = JSON.parse(post.media_group);
    } catch {
      throw new Error('media_group JSON parse hatası');
    }
    if (!Array.isArray(group) || group.length === 0) throw new Error('Boş media group');
    if (group.length > 10) throw new Error('Telegram media group max 10 öğe alır');

    const media = group.map((item, idx) => {
      const full = resolveMediaPath(item.path);
      const entry = {
        type: item.type || 'photo', // photo|video|document|audio
        media: fs.createReadStream(full),
      };
      // Caption sadece ilk öğeye konur (album-wide caption davranışı)
      if (idx === 0 && sendableText) {
        entry.caption = sendableText;
        entry.parse_mode = opts.parse_mode;
      }
      return entry;
    });
    return bot.sendMediaGroup(channel.chat_id, media, {
      disable_notification: opts.disable_notification,
    });
  }

  // 2) Tekli medya tipleri
  const mt = post.media_type;
  const photoLike = post.photo_path; // legacy ya da media_path olarak yeniden kullanılır

  if ((mt === 'photo' || (!mt && photoLike)) && photoLike) {
    return bot.sendPhoto(channel.chat_id, fs.createReadStream(resolveMediaPath(photoLike)), {
      caption: sendableText,
      ...opts,
    });
  }
  if (mt === 'video' && photoLike) {
    return bot.sendVideo(channel.chat_id, fs.createReadStream(resolveMediaPath(photoLike)), {
      caption: sendableText,
      ...opts,
    });
  }
  if (mt === 'animation' && photoLike) {
    // GIF / animasyon
    return bot.sendAnimation(channel.chat_id, fs.createReadStream(resolveMediaPath(photoLike)), {
      caption: sendableText,
      ...opts,
    });
  }
  if (mt === 'document' && photoLike) {
    return bot.sendDocument(channel.chat_id, fs.createReadStream(resolveMediaPath(photoLike)), {
      caption: sendableText,
      ...opts,
    });
  }
  if (mt === 'sticker' && photoLike) {
    // Sticker'ın caption'ı yoktur; varsa metni ayrı mesaj olarak da yollayalım
    const stickerMsg = await bot.sendSticker(channel.chat_id, fs.createReadStream(resolveMediaPath(photoLike)), {
      disable_notification: opts.disable_notification,
      reply_markup: opts.reply_markup,
    });
    if (sendableText && sendableText.trim()) {
      await bot.sendMessage(channel.chat_id, sendableText, opts);
    }
    return stickerMsg;
  }

  // 3) Sade metin
  return bot.sendMessage(channel.chat_id, sendableText, opts);
}

async function deleteChannelMessage(chatId, messageId) {
  if (!bot) throw new Error('Bot başlatılmamış');
  return bot.deleteMessage(chatId, messageId);
}

// Admin'e bildirim gönder (ör. gönderim kalıcı başarısız oldu).
// ADMIN_CHAT_ID env'i ile hedef belirlenir; yoksa sessizce atlanır.
async function notifyAdmin(text) {
  const chatId = process.env.ADMIN_CHAT_ID || process.env.NOTIFY_CHAT_ID;
  if (!bot || !chatId) return;
  try {
    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (e) {
    console.error('[bot] notifyAdmin hata:', e.message);
  }
}

module.exports = { init, getBot, sendPost, deleteChannelMessage, buildReplyMarkup, notifyAdmin };
