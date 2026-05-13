const TelegramBot = require('node-telegram-bot-api');
const { db } = require('./db');

let bot = null;
let botInfo = null;

function init() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token.startsWith('123456')) {
    console.warn('[bot] TELEGRAM_BOT_TOKEN ayarlanmamış — bot devre dışı');
    return null;
  }
  bot = new TelegramBot(token, { polling: true });

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

    // Bot API'nin eski (forward_from_chat) ve yeni (forward_origin) alanlarını kontrol et
    const fwdChat = msg.forward_from_chat || msg.forward_origin?.chat || null;
    const fwdUser = msg.forward_from || msg.forward_origin?.sender_user || null;

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
      ].filter(Boolean).join('\n');
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

    // Özel sohbette herhangi bir mesaj geldiyse (forward değil) yardımcı yönlendirme
    if (msg.chat.type === 'private' && msg.text && !msg.text.startsWith('/')) {
      bot.sendMessage(
        msg.chat.id,
        '💡 Kanal ID\'si öğrenmek için kanalından <b>bir mesajı bana ilet (forward)</b>.\nBulunduğun sohbetin ID\'sini görmek için /id yaz.',
        { parse_mode: 'HTML' },
      );
    }
  });

  return bot;
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

async function sendPost(post, channel) {
  if (!bot) throw new Error('Bot başlatılmamış (TELEGRAM_BOT_TOKEN eksik)');

  const opts = {
    parse_mode: post.parse_mode || 'HTML',
    disable_web_page_preview: !!post.disable_preview,
    disable_notification: !!post.silent,
    reply_markup: buildReplyMarkup(post.buttons),
  };

  if (post.photo_path) {
    const path = require('path');
    const fs = require('fs');
    const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
    // Geriye dönük uyum: eski kayıtlar 'uploads/xxx.jpg' formatında olabilir
    const filename = post.photo_path.replace(/^uploads[\\/]/, '');
    const fullPath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(fullPath)) throw new Error('Foto dosyası bulunamadı: ' + fullPath);
    return bot.sendPhoto(channel.chat_id, fs.createReadStream(fullPath), {
      caption: post.text,
      ...opts,
    });
  }
  return bot.sendMessage(channel.chat_id, post.text, opts);
}

module.exports = { init, getBot, sendPost, buildReplyMarkup };
