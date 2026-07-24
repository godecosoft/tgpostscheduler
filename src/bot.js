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
          'callback_query',
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
      isPostAdmin(msg.from?.id)
        ? '\n📅 <b>Premium-emojili post:</b>\nPostu (Premium hesabınla, gerçek emojilerle) bana gönder → çıkan menüden <b>Planla</b> → kanal + zaman seç. Mesaj kanala olduğu gibi kopyalanır (emojiler korunur).'
        : '',
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
    const isForwarded = !!(
      msg.forward_origin || msg.forward_date || msg.forward_from || msg.forward_from_chat || msg.forward_sender_name
    );

    // Sadece özel sohbette yanıt ver (grup/kanalda spam yapma)
    if (msg.chat.type !== 'private') return;

    // --- Yetkili admin: premium-emojili post akışı ---
    if (isPostAdmin(msg.from?.id)) {
      // 1) "Özel tarih" bekleniyorsa, bu mesajı zaman ifadesi olarak yorumla
      const pend = draftAwaits.get(msg.from.id);
      if (pend && pend.awaiting === 'custom' && msg.text && !msg.text.startsWith('/')) {
        const iso = parseWhen(msg.text, process.env.TZ || 'Europe/Istanbul');
        if (!iso) {
          bot.sendMessage(
            msg.chat.id,
            '⚠️ Tarih anlaşılmadı. Örnekler:\n' +
              '<code>+90m</code> · <code>+2h</code> · <code>+3d</code>\n' +
              '<code>2026-07-25 20:00</code> · <code>25.07.2026 20:00</code> · <code>20:00</code>',
            { parse_mode: 'HTML' },
          );
          return;
        }
        draftAwaits.delete(msg.from.id);
        createCopyPost({
          channelId: pend.channelId,
          sourceChatId: pend.sourceChatId,
          sourceMessageId: pend.sourceMessageId,
          scheduledISO: iso,
          previewText: pend.previewText,
          chatIdToReply: msg.chat.id,
        }).catch((e) => {
          console.error('[bot] createCopyPost hata:', e.message);
          bot.sendMessage(msg.chat.id, '⚠️ Post oluşturulamadı: ' + escapeHtml(e.message), { parse_mode: 'HTML' });
        });
        return;
      }

      // 2) İçerik mesajı (komut değil) → aksiyon menüsü göster
      const isCmd = msg.text && msg.text.startsWith('/');
      const hasContent = !!(
        msg.text || msg.caption || msg.photo || msg.video || msg.animation ||
        msg.document || msg.sticker || msg.audio || msg.voice || msg.video_note
      );
      if (!isCmd && hasContent) {
        bot.sendMessage(msg.chat.id, '📩 Bu mesajı ne yapayım?', {
          reply_to_message_id: msg.message_id,
          reply_markup: buildActionMenu(msg),
        });
        return;
      }
    }

    // Emoji ve kanal-ID tespitini ÇATIŞTIRMA — ikisi de varsa ikisini birden göster.
    const sections = [];

    // 1) Premium emoji ID'leri (custom emoji içeren HER mesajda)
    if (customEmojis.length > 0) {
      sections.push(
        [
          `✨ <b>${customEmojis.length} adet Premium Emoji bulundu</b>`,
          '',
          ...customEmojis.map(
            (ce, i) =>
              `${i + 1}. ${ce.fallback}  <code>${ce.id}</code>\n` +
              `   <code>&lt;tg-emoji emoji-id="${ce.id}"&gt;${escapeHtml(ce.fallback)}&lt;/tg-emoji&gt;</code>`,
          ),
          '',
          '👉 Web panelde bu <code>emoji-id</code> değerini kullan.',
          '<i>Not: Premium olmayanlar fallback (standart) emojiyi görür.</i>',
        ].join('\n'),
      );
    }

    // 2) İletilen kaynak bir kanal/grup ise chat_id
    if (fwdChat) {
      sections.push(
        [
          '✅ <b>İletilen mesajın kaynağı</b>',
          `📡 Chat ID: <code>${fwdChat.id}</code>`,
          `Tür: <code>${fwdChat.type}</code>`,
          fwdChat.title ? `İsim: ${escapeHtml(fwdChat.title)}` : '',
          fwdChat.username ? `Kullanıcı adı: @${fwdChat.username}` : '',
          '',
          '👉 Bu ID\'yi "Kanallar → Yeni Kanal" ekranına yapıştır. Botu kanala <b>admin</b> eklemeyi unutma.',
        ].filter(Boolean).join('\n'),
      );
    }

    if (sections.length > 0) {
      bot.sendMessage(msg.chat.id, sections.join('\n\n➖➖➖➖➖\n\n'), { parse_mode: 'HTML' });
      return;
    }

    // 3) İletilen ama kaynağı kullanıcı
    if (fwdUser) {
      bot.sendMessage(
        msg.chat.id,
        `👤 İletilen mesaj bir kullanıcıdan: <code>${fwdUser.id}</code>\n\n` +
          'Kanal ID için kanaldaki bir mesajı ilet; emoji ID için içinde <b>premium emoji</b> olan bir mesaj gönder/ilet.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    // 4) İletilen ama kaynağı GİZLİ (gönderen adı gizli / içerik korumalı)
    if (isForwarded) {
      bot.sendMessage(
        msg.chat.id,
        '⚠️ Bu iletilen mesajın kaynağı <b>gizli</b> (gönderen adı gizleniyor ya da içerik korumalı), chat_id okuyamıyorum.\n\n' +
          'Çözüm: Botu kanala <b>yönetici</b> olarak ekle — kanal otomatik kaydedilir.',
        { parse_mode: 'HTML' },
      );
      return;
    }

    // 5) Düz mesaj → ne yapabileceğini anlat
    if (msg.text && !msg.text.startsWith('/')) {
      bot.sendMessage(
        msg.chat.id,
        '💡 <b>Sana şunları verebilirim:</b>\n' +
          '• <b>Kanal ID</b> — kanaldan bir mesajı bana <b>ilet (forward)</b>.\n' +
          '• <b>Premium emoji ID</b> — içinde <b>custom (premium) emoji</b> olan bir mesajı gönder ya da ilet.\n\n' +
          'Bulunduğun sohbetin ID\'si için /id yaz.',
        { parse_mode: 'HTML' },
      );
    }
  });

  // --- Premium-emojili post akışı: inline buton callback'leri ---
  bot.on('callback_query', async (cbq) => {
    const data = cbq.data || '';
    if (!data.startsWith('p:')) return;
    const ack = (text) => bot.answerCallbackQuery(cbq.id, text ? { text } : {}).catch(() => {});
    try {
      const userId = cbq.from?.id;
      const chatId = cbq.message?.chat?.id;
      const menuMsgId = cbq.message?.message_id;
      const src = cbq.message?.reply_to_message || null; // orijinal içerik mesajı
      const editMenu = (text, reply_markup) =>
        bot.editMessageText(text, {
          chat_id: chatId, message_id: menuMsgId, parse_mode: 'HTML',
          reply_markup, disable_web_page_preview: true,
        }).catch(() => {});

      if (!isPostAdmin(userId)) {
        await ack('Yetkin yok');
        await bot.sendMessage(
          chatId,
          `⛔ Post oluşturma yetkin yok.\n\nSenin Telegram ID’in: <code>${userId}</code>\n` +
            `Bunu sunucuda <code>BOT_POST_ADMINS</code> değişkenine ekleyip botu yeniden başlat.`,
          { parse_mode: 'HTML' },
        );
        return;
      }

      if (data === 'p:x') {
        await ack('İptal edildi');
        await editMenu('✖️ İptal edildi.');
        return;
      }

      // Emoji ID'lerini çıkar
      if (data === 'p:emoji') {
        await ack();
        const ents = (src?.entities || src?.caption_entities || []).filter((e) => e.type === 'custom_emoji' && e.custom_emoji_id);
        const txt = src?.text || src?.caption || '';
        if (!ents.length) { await editMenu('✨ Bu mesajda premium emoji bulunamadı.'); return; }
        const lines = ents.map((e, i) => {
          const fb = txt.substring(e.offset, e.offset + e.length);
          return `${i + 1}. ${fb}  <code>${e.custom_emoji_id}</code>\n` +
            `   <code>&lt;tg-emoji emoji-id="${e.custom_emoji_id}"&gt;${escapeHtml(fb)}&lt;/tg-emoji&gt;</code>`;
        });
        await editMenu(`✨ <b>${ents.length} premium emoji</b>\n\n${lines.join('\n')}`);
        return;
      }

      // Kaynak kanal ID
      if (data === 'p:chid') {
        await ack();
        const fwdChat = src?.forward_from_chat || src?.forward_origin?.chat || null;
        if (!fwdChat) { await editMenu('📡 Bu mesajın kaynağı bir kanal/grup değil.'); return; }
        await editMenu(
          `📡 <b>Kaynak</b>\nChat ID: <code>${fwdChat.id}</code>\nTür: <code>${fwdChat.type}</code>` +
            (fwdChat.title ? `\nİsim: ${escapeHtml(fwdChat.title)}` : ''),
        );
        return;
      }

      // Planla → kanal listesi
      if (data === 'p:plan') {
        if (!src) { await ack('Kaynak mesaj bulunamadı'); await editMenu('⚠️ Kaynak mesaj bulunamadı, tekrar gönder.'); return; }
        const channels = db.prepare('SELECT id, name FROM channels ORDER BY name').all();
        if (!channels.length) {
          await ack();
          await editMenu('⚠️ Kayıtlı kanal yok. Önce botu kanalına <b>admin</b> olarak ekle.');
          return;
        }
        const rows = channels.map((c) => [{ text: c.name, callback_data: `p:ch:${c.id}` }]);
        rows.push([{ text: '✖️ İptal', callback_data: 'p:x' }]);
        await ack();
        await editMenu('📡 Hangi kanala gönderilsin?', { inline_keyboard: rows });
        return;
      }

      // Kanal seçildi → zaman seçenekleri
      let m = data.match(/^p:ch:(\d+)$/);
      if (m) {
        const channelId = Number(m[1]);
        const btns = SCHEDULE_PRESETS.map((p) => ({ text: p.label, callback_data: `p:t:${p.m}:${channelId}` }));
        const rows = [];
        for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
        rows.push([{ text: '🗓 Özel tarih/saat', callback_data: `p:tc:${channelId}` }]);
        rows.push([{ text: '✖️ İptal', callback_data: 'p:x' }]);
        await ack();
        await editMenu('⏰ Ne zaman gönderilsin?', { inline_keyboard: rows });
        return;
      }

      // Hazır zaman seçildi → post oluştur
      m = data.match(/^p:t:(\d+):(\d+)$/);
      if (m) {
        if (!src) { await ack('Kaynak mesaj bulunamadı'); await editMenu('⚠️ Kaynak mesaj bulunamadı, tekrar gönder.'); return; }
        const mins = Number(m[1]);
        const channelId = Number(m[2]);
        // "Şimdi" için 1sn geriye al ki ilk tick hemen alsın
        const iso = new Date(Date.now() + (mins === 0 ? -1000 : mins * 60000)).toISOString();
        await ack('Planlandı ✅');
        await createCopyPost({
          channelId,
          sourceChatId: src.chat.id,
          sourceMessageId: src.message_id,
          scheduledISO: iso,
          previewText: src.text || src.caption || '[Telegram içeriği]',
          editMsg: { chat_id: chatId, message_id: menuMsgId },
        });
        return;
      }

      // Özel tarih iste
      m = data.match(/^p:tc:(\d+)$/);
      if (m) {
        if (!src) { await ack('Kaynak mesaj bulunamadı'); await editMenu('⚠️ Kaynak mesaj bulunamadı, tekrar gönder.'); return; }
        const channelId = Number(m[1]);
        draftAwaits.set(userId, {
          awaiting: 'custom',
          channelId,
          sourceChatId: src.chat.id,
          sourceMessageId: src.message_id,
          previewText: src.text || src.caption || '[Telegram içeriği]',
        });
        await ack();
        await editMenu(
          '🗓 <b>Tarih/saat yaz:</b>\n\n' +
            '• Göreli: <code>+90m</code> · <code>+2h</code> · <code>+3d</code>\n' +
            '• Tam: <code>2026-07-25 20:00</code> · <code>25.07.2026 20:00</code>\n' +
            '• Sadece saat: <code>20:00</code> (bugün; geçmişse yarın)',
        );
        return;
      }

      await ack();
    } catch (e) {
      console.error('[bot] callback_query hata:', e.message);
      await ack('Hata oluştu');
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

// ======================================================================
// Bot üzerinden premium-emojili post akışı (copyMessage tabanlı)
// Kullanıcı postu Telegram'da (Premium hesapla, gerçek emojilerle) yazıp
// bota gönderir; bot planlanan saatte kanala copyMessage ile kopyalar.
// ======================================================================

// Yetkili kullanıcılar (post oluşturabilir). BOT_POST_ADMINS öncelikli,
// yoksa ADMIN_CHAT_ID'e düşer. Virgül/boşlukla ayrılmış Telegram user ID listesi.
function getPostAdmins() {
  const raw = process.env.BOT_POST_ADMINS || process.env.ADMIN_CHAT_ID || '';
  return new Set(String(raw).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean));
}
function isPostAdmin(userId) {
  if (userId == null) return false;
  return getPostAdmins().has(String(userId));
}

// Yalnızca "özel tarih" beklerken kısa süreli tutulan taslaklar.
// userId -> { awaiting:'custom', channelId, sourceChatId, sourceMessageId, previewText }
const draftAwaits = new Map();

const SCHEDULE_PRESETS = [
  { m: 0, label: '⚡ Şimdi' },
  { m: 10, label: '10 dk' },
  { m: 30, label: '30 dk' },
  { m: 60, label: '1 saat' },
  { m: 180, label: '3 saat' },
  { m: 360, label: '6 saat' },
  { m: 1440, label: 'Yarın (+24s)' },
];

// tz'deki güncel takvim gününü (yıl/ay/gün) döndür
function tzNowParts(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return { y: +map.year, mo: +map.month, d: +map.day };
}

// tz'deki bir duvar-saati (y,mo,d,h,mi) → UTC ISO string
function zonedWallClockToUtcISO(y, mo, d, h, mi, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(guess));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  let hh = +map.hour;
  if (hh === 24) hh = 0; // bazı ortamlar 24:00 döndürebilir
  const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, hh, +map.minute, +map.second);
  const offset = asUTC - guess; // tz, UTC'den bu kadar ileride
  return new Date(guess - offset).toISOString();
}

// Kullanıcının yazdığı zaman ifadesini UTC ISO'ya çevir (geçersizse null)
function parseWhen(input, tz) {
  const s = String(input || '').trim();
  // Göreli: +90m / +2h / +3d (dk/saat/gün Türkçe kısaltmaları da kabul)
  let m = s.match(/^\+\s*(\d+)\s*(m|dk|dak|h|s|sa|saat|d|g|gun|gün)$/i);
  if (m) {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    let ms;
    if (u === 'm' || u === 'dk' || u === 'dak') ms = n * 60000;
    else if (u === 'd' || u === 'g' || u === 'gun' || u === 'gün') ms = n * 86400000;
    else ms = n * 3600000; // saat
    return new Date(Date.now() + ms).toISOString();
  }
  // Tam: 2026-07-25 20:00  (ya da 'T' ile)
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/);
  if (m) return zonedWallClockToUtcISO(+m[1], +m[2], +m[3], +m[4], +m[5], tz);
  // Tam: 25.07.2026 20:00
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (m) return zonedWallClockToUtcISO(+m[3], +m[2], +m[1], +m[4], +m[5], tz);
  // Sadece saat: 20:00 → bugün (tz); geçmişse yarın
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const now = tzNowParts(tz);
    let iso = zonedWallClockToUtcISO(now.y, now.mo, now.d, +m[1], +m[2], tz);
    if (new Date(iso).getTime() <= Date.now()) {
      const t = new Date(Date.UTC(now.y, now.mo - 1, now.d) + 86400000);
      iso = zonedWallClockToUtcISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), +m[1], +m[2], tz);
    }
    return iso;
  }
  return null;
}

function formatWhen(d, tz) {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: tz, dateStyle: 'medium', timeStyle: 'short',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

// Bir içerik mesajı için aksiyon menüsü (Planla / Emoji / Kanal ID / İptal)
function buildActionMenu(msg) {
  const rows = [[{ text: '📅 Planla / Kanala Kopyala', callback_data: 'p:plan' }]];
  const entities = msg.entities || msg.caption_entities || [];
  if (entities.some((e) => e.type === 'custom_emoji')) {
    rows.push([{ text: '✨ Emoji ID’lerini ver', callback_data: 'p:emoji' }]);
  }
  const fwdChat = msg.forward_from_chat || msg.forward_origin?.chat || null;
  if (fwdChat) rows.push([{ text: '📡 Kaynak Kanal ID', callback_data: 'p:chid' }]);
  rows.push([{ text: '✖️ İptal', callback_data: 'p:x' }]);
  return { inline_keyboard: rows };
}

// Kopya-post oluştur: (opsiyonel) kalıcı depolama kanalına kopyala, posts kaydı aç
async function createCopyPost({ channelId, sourceChatId, sourceMessageId, scheduledISO, previewText, editMsg, chatIdToReply }) {
  const tz = process.env.TZ || 'Europe/Istanbul';
  const channel = db.prepare('SELECT id, name, chat_id FROM channels WHERE id = ?').get(channelId);
  const notify = async (text) => {
    if (editMsg) {
      await bot.editMessageText(text, { ...editMsg, parse_mode: 'HTML' }).catch(() =>
        bot.sendMessage(editMsg.chat_id, text, { parse_mode: 'HTML' }));
    } else if (chatIdToReply) {
      await bot.sendMessage(chatIdToReply, text, { parse_mode: 'HTML' });
    }
  };
  if (!channel) {
    await notify('⚠️ Kanal bulunamadı. Tekrar dene.');
    return;
  }

  let srcChat = String(sourceChatId);
  let srcMsg = Number(sourceMessageId);

  // Kalıcı depolama kanalı varsa oraya kopyala — kullanıcı orijinali silse bile
  // gönderilebilsin (bot orada admin olmalı).
  const STORAGE = process.env.POST_SOURCE_CHAT_ID;
  if (STORAGE) {
    try {
      const s = await bot.copyMessage(STORAGE, sourceChatId, Number(sourceMessageId));
      srcChat = String(STORAGE);
      srcMsg = s.message_id;
    } catch (e) {
      console.warn('[bot] depolama kanalına kopyalama başarısız, DM referansı kullanılacak:', e.message);
    }
  }

  const text = String(previewText || '[Telegram içeriği]').slice(0, 1000);
  const info = db
    .prepare(
      `INSERT INTO posts (channel_id, text, parse_mode, scheduled_at, status, media_type, source_chat_id, source_message_id)
       VALUES (?, ?, 'HTML', ?, 'pending', 'copy', ?, ?)`,
    )
    .run(channelId, text, scheduledISO, srcChat, srcMsg);

  try {
    require('./audit').audit('telegram-bot', 'post.create', 'post', info.lastInsertRowid, `${channel.name} (bot/kopya)`);
  } catch { /* audit opsiyonel */ }

  const whenStr = formatWhen(new Date(scheduledISO), tz);
  const storageNote = STORAGE ? '' : '\n\n<i>⚠️ Gönderilene kadar bu mesajı botla olan sohbetten silme.</i>';
  await notify(
    `✅ <b>Planlandı</b> (post #${info.lastInsertRowid})\n\n` +
      `📡 Kanal: <b>${escapeHtml(channel.name)}</b>\n` +
      `⏰ ${escapeHtml(whenStr)}\n\n` +
      `Mesaj olduğu gibi (premium emojiler dahil) kanala kopyalanacak.` +
      storageNote,
  );
  console.log(`[bot] kopya-post #${info.lastInsertRowid} planlandı → ${channel.name} @ ${scheduledISO}`);
}

function getBot() {
  return bot;
}

function getBotInfo() {
  return botInfo;
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
  // Premium (custom) emoji içeren postları, bot yerine Premium kullanıcı hesabıyla
  // (userbot / MTProto) gönder — bot API kanala premium emoji basamıyor.
  const userbot = require('./userbot');
  if (userbot.shouldRoute(post)) {
    try {
      return await userbot.sendViaUserbot(post, channel);
    } catch (e) {
      console.error('[bot] userbot gönderimi başarısız, bot API ile deneniyor (emoji fallback olabilir):', e.message);
      // Aşağıdaki bot yoluna düş — post en azından gider
    }
  }

  if (!bot) throw new Error('Bot başlatılmamış (TELEGRAM_BOT_TOKEN eksik)');

  // Telegram'dan kopyalanan post — copyMessage ile birebir kopyalanır.
  // Metni YENİDEN kurmadığımız için premium (custom) emoji entity'leri korunur;
  // Fragment username'e gerek kalmadan kanalda premium emoji çalışır.
  if (post.media_type === 'copy' && post.source_chat_id && post.source_message_id) {
    return bot.copyMessage(channel.chat_id, post.source_chat_id, Number(post.source_message_id), {
      disable_notification: !!post.silent,
      reply_markup: buildReplyMarkup(post.buttons),
    });
  }

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

module.exports = { init, getBot, getBotInfo, sendPost, deleteChannelMessage, buildReplyMarkup, notifyAdmin };
