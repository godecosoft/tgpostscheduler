const cron = require('node-cron');
const cronParser = require('cron-parser');
const { db } = require('./db');
const { sendPost, deleteChannelMessage, notifyAdmin } = require('./bot');

// Otomatik retry ayarları
const MAX_ATTEMPTS = 3; // bu kadar denemeden sonra kalıcı 'failed'
const BACKOFF_MINUTES = [2, 5, 15]; // denemeler arası bekleme (backoff)

function nextRecurringDate(currentISO, recurring) {
  // Basit önayar tekrarları
  const d = new Date(currentISO);
  if (recurring === 'hourly') d.setHours(d.getHours() + 1);
  else if (recurring === 'daily') d.setDate(d.getDate() + 1);
  else if (recurring === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurring === 'monthly') d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString();
}

function nextCronDate(cronExpression, fromISO) {
  // Custom cron — örn: "0 12 * * 1-5" (hafta içi öğlen)
  try {
    const interval = cronParser.parseExpression(cronExpression, {
      currentDate: fromISO ? new Date(fromISO) : new Date(),
      tz: process.env.TZ || 'Europe/Istanbul',
    });
    return interval.next().toDate().toISOString();
  } catch (err) {
    console.error('[scheduler] cron parse hatası:', cronExpression, err.message);
    return null;
  }
}

async function processPendingPosts() {
  const nowISO = new Date().toISOString();
  const pending = db
    .prepare(
      `SELECT p.*, c.chat_id as channel_chat_id, c.name as channel_name
       FROM posts p
       JOIN channels c ON c.id = p.channel_id
       WHERE p.status = 'pending' AND p.scheduled_at <= ?
       ORDER BY p.scheduled_at ASC
       LIMIT 20`,
    )
    .all(nowISO);

  for (const post of pending) {
    try {
      const channel = { chat_id: post.channel_chat_id, name: post.channel_name };
      const result = await sendPost(post, channel);
      // Media group → array of messages, ilk message_id'yi sakla
      const messageId = Array.isArray(result)
        ? result[0]?.message_id || null
        : result?.message_id || null;

      // Auto-delete planı
      let deleteAt = null;
      if (post.auto_delete_minutes && post.auto_delete_minutes > 0) {
        const d = new Date();
        d.setMinutes(d.getMinutes() + post.auto_delete_minutes);
        deleteAt = d.toISOString();
      }

      db.prepare(
        `UPDATE posts SET status = 'sent', sent_at = datetime('now'),
         telegram_message_id = ?, error = NULL, delete_at = ? WHERE id = ?`,
      ).run(messageId, deleteAt, post.id);
      console.log(`[scheduler] Gönderildi: post #${post.id} → ${post.channel_name}`);

      // Recurring (önayar) ise yeni post oluştur
      let nextDate = null;
      if (post.cron_expression) {
        nextDate = nextCronDate(post.cron_expression, post.scheduled_at);
      } else if (post.recurring) {
        nextDate = nextRecurringDate(post.scheduled_at, post.recurring);
      }
      if (nextDate && post.time_range_minutes && post.time_range_minutes > 0) {
        // Rastgele offset uygula — her tekrarda farklı saat
        const d = new Date(nextDate);
        const offset = Math.floor(Math.random() * post.time_range_minutes);
        d.setMinutes(d.getMinutes() + offset);
        nextDate = d.toISOString();
      }

      // --- Seri limitleri: max sayı / bitiş tarihi ---
      const thisOccurrence = post.occurrence_num || 1;
      if (nextDate && post.max_occurrences && thisOccurrence >= post.max_occurrences) {
        console.log(
          `[scheduler] seri #${post.series_id || post.id} max ${post.max_occurrences} gönderime ulaştı — durduruluyor`,
        );
        nextDate = null;
      }
      if (nextDate && post.recurrence_end && new Date(nextDate) > new Date(post.recurrence_end)) {
        console.log(
          `[scheduler] seri #${post.series_id || post.id} bitiş tarihini geçti (${post.recurrence_end}) — durduruluyor`,
        );
        nextDate = null;
      }

      if (nextDate) {
        db.prepare(
          `INSERT INTO posts (channel_id, text, photo_path, buttons, parse_mode, disable_preview, silent,
           scheduled_at, recurring, cron_expression, auto_delete_minutes, media_type, media_group,
           time_range_minutes, series_id, occurrence_num, max_occurrences, recurrence_end)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          post.channel_id,
          post.text,
          post.photo_path,
          post.buttons,
          post.parse_mode,
          post.disable_preview,
          post.silent,
          nextDate,
          post.recurring,
          post.cron_expression,
          post.auto_delete_minutes,
          post.media_type,
          post.media_group,
          post.time_range_minutes || 0,
          post.series_id || String(post.id),
          thisOccurrence + 1,
          post.max_occurrences || null,
          post.recurrence_end || null,
        );
      }
    } catch (err) {
      const errMsg = err.message || String(err);
      const attempts = (post.attempts || 0) + 1;

      if (attempts < MAX_ATTEMPTS) {
        // Backoff ile yeniden dene — pending kalır, scheduled_at ileri alınır
        const waitMin = BACKOFF_MINUTES[attempts - 1] || 15;
        const nextTry = new Date(Date.now() + waitMin * 60 * 1000).toISOString();
        db.prepare(
          `UPDATE posts SET attempts = ?, error = ?, scheduled_at = ? WHERE id = ?`,
        ).run(attempts, errMsg, nextTry, post.id);
        console.warn(
          `[scheduler] post #${post.id} deneme ${attempts}/${MAX_ATTEMPTS} başarısız — ${waitMin}dk sonra tekrar: ${errMsg}`,
        );
      } else {
        // Kalıcı başarısız — admin'e bildir
        db.prepare(`UPDATE posts SET status = 'failed', attempts = ?, error = ? WHERE id = ?`).run(
          attempts,
          errMsg,
          post.id,
        );
        console.error(`[scheduler] post #${post.id} KALICI başarısız (${attempts} deneme): ${errMsg}`);
        notifyAdmin(
          `🔴 <b>Gönderim başarısız</b>\n\n` +
            `Post #${post.id} → <b>${escapeHtml(post.channel_name)}</b>\n` +
            `${attempts} deneme yapıldı, hepsi başarısız.\n\n` +
            `Hata: <code>${escapeHtml(errMsg)}</code>\n\n` +
            `Panelden "Geçmiş → Başarısız" altından tekrar deneyebilirsin.`,
        );
      }
    }
  }
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function processAutoDeletes() {
  const nowISO = new Date().toISOString();
  const due = db
    .prepare(
      `SELECT p.id, p.telegram_message_id, c.chat_id as chat_id
       FROM posts p JOIN channels c ON c.id = p.channel_id
       WHERE p.status = 'sent'
         AND p.delete_at IS NOT NULL
         AND p.delete_at <= ?
         AND p.telegram_message_id IS NOT NULL
       LIMIT 20`,
    )
    .all(nowISO);

  for (const row of due) {
    try {
      await deleteChannelMessage(row.chat_id, row.telegram_message_id);
      db.prepare(`UPDATE posts SET status = 'deleted', delete_at = NULL WHERE id = ?`).run(row.id);
      console.log(`[scheduler] Auto-delete: post #${row.id}`);
    } catch (err) {
      const msg = err.message || String(err);
      // Telegram'da zaten silinmişse veya 48h limiti geçtiyse, status'u "deleted" işaretle
      if (/message to delete not found|message can't be deleted/i.test(msg)) {
        db.prepare(`UPDATE posts SET status = 'deleted', delete_at = NULL, error = ? WHERE id = ?`).run(
          msg,
          row.id,
        );
      } else {
        db.prepare(`UPDATE posts SET error = ? WHERE id = ?`).run(msg, row.id);
        console.error(`[scheduler] Auto-delete hata #${row.id}:`, msg);
      }
    }
  }
}

function start() {
  // Her dakika kontrol — pending postlar + auto-delete birlikte
  cron.schedule('* * * * *', () => {
    processPendingPosts().catch((e) => console.error('[scheduler] döngü hatası:', e));
    processAutoDeletes().catch((e) => console.error('[scheduler] delete döngü hatası:', e));
  });
  console.log('[scheduler] Başlatıldı (her dakika kontrol ediyor)');
  // İlk açılışta bir kez hemen çalıştır
  processPendingPosts().catch(() => {});
  processAutoDeletes().catch(() => {});
}

module.exports = { start, processPendingPosts, processAutoDeletes, nextCronDate };
