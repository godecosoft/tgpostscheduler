/**
 * Userbot — kendi Premium hesabınla (MTProto / GramJS) kanala gönderim.
 *
 * Neden var: Bot API, bir kanala custom (premium) emoji gönderemiyor
 * (Fragment username olmadan fallback'e düşüyor). Gönderen GERÇEK bir Premium
 * kullanıcı hesabı olursa premium emoji korunur. Bu modül, premium emoji içeren
 * postları bot yerine senin Premium hesabınla gönderir.
 *
 * Yapılandırma (env):
 *   TELEGRAM_API_ID    — my.telegram.org → API development tools
 *   TELEGRAM_API_HASH  — aynı yerden
 *   TELEGRAM_SESSION   — `node scripts/userbot-login.js` ile bir kez üretilir
 *
 * Not: Kullanıcı hesabı inline buton (reply_markup) gönderemez — premium emojili
 * postlarda butonlar düşürülür. Media group ve 'copy' tipi postlar bota bırakılır.
 */

const path = require('path');
const fs = require('fs');

let client = null;
let meInfo = null;
let connecting = null;

function isConfigured() {
  return !!(process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_SESSION);
}

async function initUserbot() {
  if (!isConfigured()) {
    console.warn('[userbot] TELEGRAM_API_ID / API_HASH / SESSION eksik — userbot devre dışı (premium emoji fallback olur)');
    return null;
  }
  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const { TelegramClient } = require('telegram');
    const { StringSession } = require('telegram/sessions');

    const apiId = Number(process.env.TELEGRAM_API_ID);
    const apiHash = String(process.env.TELEGRAM_API_HASH);
    const session = new StringSession(String(process.env.TELEGRAM_SESSION));

    const c = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      autoReconnect: true,
      retryDelay: 2000,
    });
    try { c.setLogLevel && c.setLogLevel('error'); } catch { /* eski sürümlerde yok */ }

    await c.connect();
    if (!(await c.isUserAuthorized())) {
      console.error('[userbot] SESSION geçersiz/expired — scripts/userbot-login.js ile yeniden giriş yap');
      try { await c.disconnect(); } catch { /* yok say */ }
      connecting = null;
      return null;
    }

    meInfo = await c.getMe();
    // Kanal entity'lerini id ile çözebilmek için dialog cache'ini ısıt
    try { await c.getDialogs({ limit: 200 }); } catch (e) { console.warn('[userbot] getDialogs uyarı:', e.message); }

    client = c;
    const who = meInfo?.username ? '@' + meInfo.username : (meInfo?.firstName || 'kullanıcı');
    console.log(`[userbot] bağlandı: ${who} ${meInfo?.premium ? '(Premium ✅)' : '(Premium DEĞİL ⚠️)'}`);
    if (meInfo && !meInfo.premium) {
      console.warn('[userbot] UYARI: Hesap Premium değil — premium emoji yine standart görünür.');
    }
    return client;
  })();

  return connecting;
}

function isUserbotReady() {
  return !!client;
}
function getUserbotInfo() {
  return meInfo;
}

// Metin premium (custom) emoji içeriyor mu?
function hasPremiumEmoji(post) {
  return typeof post?.text === 'string' && post.text.includes('<tg-emoji');
}

// Bu post userbot ile mi gönderilsin?
function shouldRoute(post) {
  if (!isUserbotReady()) return false;
  if (!hasPremiumEmoji(post)) return false;
  // Media group ve kopya (copyMessage) tiplerini v1'de bot gönderiyor
  if (post.media_type === 'media_group' || post.media_type === 'copy') return false;
  return true;
}

// Panelin HTML'ini GramJS parser'ının anladığı etiketlere çevir.
// GramJS: spoiler=<spoiler>, underline=<u>, strike=<s>; <ins>/<strike>/<span>/<tg-spoiler> yok.
function normalizeHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<tg-spoiler>/gi, '<spoiler>')
    .replace(/<\/tg-spoiler>/gi, '</spoiler>')
    .replace(/<ins>/gi, '<u>')
    .replace(/<\/ins>/gi, '</u>')
    .replace(/<strike>/gi, '<s>')
    .replace(/<\/strike>/gi, '</s>')
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '');
}

function resolveMediaPath(p) {
  const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
  const filename = String(p).replace(/^uploads[\\/]/, '');
  const full = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(full)) throw new Error('Medya dosyası bulunamadı: ' + full);
  return full;
}

async function resolvePeer(channel) {
  // Public kanal → username daha güvenilir; değilse numeric id (dialog cache'ten çözülür)
  if (channel.username) {
    const u = String(channel.username).startsWith('@') ? channel.username : '@' + channel.username;
    return client.getInputEntity(u);
  }
  return client.getInputEntity(Number(channel.chat_id));
}

/**
 * Premium-emojili postu Premium hesapla gönder. Dönüş: { message_id } (scheduler uyumu).
 */
async function sendViaUserbot(post, channel) {
  if (!client) throw new Error('Userbot bağlı değil');
  const peer = await resolvePeer(channel);
  const message = normalizeHtml(post.text || '');
  const mt = post.media_type;
  const mediaPath = post.photo_path;

  if (post.buttons) {
    console.warn('[userbot] not: kullanıcı hesabı inline buton gönderemez — butonlar bu postta düşürülüyor');
  }

  let sent;
  if ((mt === 'photo' || mt === 'video' || mt === 'animation' || mt === 'document') && mediaPath) {
    sent = await client.sendFile(peer, {
      file: resolveMediaPath(mediaPath),
      caption: message,
      parseMode: 'html',
      forceDocument: mt === 'document',
      silent: !!post.silent,
    });
  } else {
    sent = await client.sendMessage(peer, {
      message,
      parseMode: 'html',
      silent: !!post.silent,
      linkPreview: !post.disable_preview,
    });
  }

  const id = Array.isArray(sent) ? sent[0]?.id : sent?.id;
  return { message_id: id };
}

module.exports = {
  initUserbot,
  isUserbotReady,
  getUserbotInfo,
  isConfigured,
  shouldRoute,
  sendViaUserbot,
  hasPremiumEmoji,
  normalizeHtml,
};
