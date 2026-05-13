const cron = require('node-cron');
const { db } = require('./db');
const { sendPost } = require('./bot');

function nextRecurringDate(currentISO, recurring) {
  // recurring: 'daily' | 'weekly' | 'monthly' | 'hourly'
  const d = new Date(currentISO);
  if (recurring === 'hourly') d.setHours(d.getHours() + 1);
  else if (recurring === 'daily') d.setDate(d.getDate() + 1);
  else if (recurring === 'weekly') d.setDate(d.getDate() + 7);
  else if (recurring === 'monthly') d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString();
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
      const messageId = result.message_id || null;
      db.prepare(
        `UPDATE posts SET status = 'sent', sent_at = datetime('now'), telegram_message_id = ?, error = NULL WHERE id = ?`,
      ).run(messageId, post.id);
      console.log(`[scheduler] Gönderildi: post #${post.id} → ${post.channel_name}`);

      // Recurring ise yeni post oluştur
      if (post.recurring) {
        const next = nextRecurringDate(post.scheduled_at, post.recurring);
        if (next) {
          db.prepare(
            `INSERT INTO posts (channel_id, text, photo_path, buttons, parse_mode, disable_preview, silent, scheduled_at, recurring)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            post.channel_id,
            post.text,
            post.photo_path,
            post.buttons,
            post.parse_mode,
            post.disable_preview,
            post.silent,
            next,
            post.recurring,
          );
        }
      }
    } catch (err) {
      const errMsg = err.message || String(err);
      db.prepare(`UPDATE posts SET status = 'failed', error = ? WHERE id = ?`).run(errMsg, post.id);
      console.error(`[scheduler] Hata: post #${post.id} →`, errMsg);
    }
  }
}

function start() {
  // Her dakika kontrol
  cron.schedule('* * * * *', () => {
    processPendingPosts().catch((e) => console.error('[scheduler] döngü hatası:', e));
  });
  console.log('[scheduler] Başlatıldı (her dakika kontrol ediyor)');
  // İlk açılışta bir kez hemen çalıştır
  processPendingPosts().catch(() => {});
}

module.exports = { start, processPendingPosts };
