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

  // /start ve /id komutları — kanal/grup chat_id öğrenmek için
  bot.onText(/\/(start|id)/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `Chat ID: <code>${msg.chat.id}</code>\nTür: ${msg.chat.type}\nİsim: ${msg.chat.title || msg.chat.username || '-'}`,
      { parse_mode: 'HTML' },
    );
  });

  return bot;
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
