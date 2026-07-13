const cron = require('node-cron');
const cronParser = require('cron-parser');
const { db } = require('./db');
const { sendPost, deleteChannelMessage, notifyAdmin } = require('./bot');
const { audit } = require('./audit');
const { poolPick, mergePoolItem } = require('./pool');
const { fetchChannelFeed, fetchSinglePostViews } = require('./viewScraper');

// Otomatik retry ayarları
const MAX_ATTEMPTS = 3; // bu kadar denemeden sonra kalıcı 'failed'
const BACKOFF_MINUTES = [2, 5, 15]; // denemeler arası bekleme (backoff)

// --- View takibi (t.me/s scraping) ayarları ---
const VIEW_TRACKING_DAYS = Number(process.env.VIEW_TRACKING_DAYS) || 20; // postu kaç gün takip et
const VIEW_SCRAPING_ON = process.env.DISABLE_VIEW_SCRAPING !== '1'; // '1' ile kapat
const EMBED_FETCH_CAP = 25;   // tek çalışmada en fazla kaç eski post (embed) çekilsin
const HTTP_THROTTLE_MS = 700;  // istekler arası nazik bekleme

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function reactionsTotal(json) {
  try {
    const m = json ? JSON.parse(json) : {};
    return Object.values(m).reduce((a, b) => a + Number(b || 0), 0);
  } catch {
    return 0;
  }
}

// Yaş katmanına göre bu post şu an güncellenmeli mi? (taze postlar sık, eskiler seyrek)
function viewDue(sentAtISO, lastUpdateISO, nowMs) {
  const sent = Date.parse((sentAtISO || '').replace(' ', 'T') + 'Z') || 0;
  const last = lastUpdateISO ? (Date.parse((lastUpdateISO || '').replace(' ', 'T') + 'Z') || 0) : 0;
  const ageH = (nowMs - sent) / 3.6e6;
  const sinceMin = (nowMs - last) / 6e4;
  if (ageH < 6) return sinceMin >= 15;   // ilk 6 saat: 15 dk'da bir
  if (ageH < 48) return sinceMin >= 60;  // ilk 2 gün: saatte bir
  return sinceMin >= 360;                // 20 güne kadar: 6 saatte bir
}

// Bir post için view'ı yaz: posts.views + değiştiyse zaman-serisi kaydı
function saveViews(post, views) {
  db.prepare(`UPDATE posts SET views = ?, last_stats_update = datetime('now') WHERE id = ?`).run(
    views,
    post.id,
  );
  if (views !== post.views) {
    db.prepare(
      `INSERT INTO post_stats_history (post_id, views, reactions_total) VALUES (?, ?, ?)`,
    ).run(post.id, views, reactionsTotal(post.reactions));
  }
}

let pollingViews = false;
async function pollViews() {
  if (!VIEW_SCRAPING_ON || pollingViews) return;
  pollingViews = true;
  try {
    const nowMs = Date.now();
    // Aday postlar: gönderilmiş, msg_id var, kanal public (username), pencere içinde
    const candidates = db
      .prepare(
        `SELECT p.id, p.telegram_message_id AS mid, p.views, p.reactions, p.sent_at, p.last_stats_update,
                c.username AS username
         FROM posts p JOIN channels c ON c.id = p.channel_id
         WHERE p.status = 'sent' AND p.telegram_message_id IS NOT NULL
           AND c.username IS NOT NULL AND c.username != ''
           AND p.sent_at >= datetime('now', ?)`,
      )
      .all(`-${VIEW_TRACKING_DAYS} days`)
      .filter((p) => viewDue(p.sent_at, p.last_stats_update, nowMs));

    if (!candidates.length) return;

    // Kanala (username) göre grupla
    const byChannel = new Map();
    for (const p of candidates) {
      if (!byChannel.has(p.username)) byChannel.set(p.username, []);
      byChannel.get(p.username).push(p);
    }

    let embedBudget = EMBED_FETCH_CAP;
    for (const [username, posts] of byChannel) {
      // 1) Tek feed isteği son ~20 postu kapsar
      let feed = new Map();
      try {
        feed = await fetchChannelFeed(username);
      } catch (e) {
        console.warn(`[views] feed hata @${username}: ${e.message}`);
      }
      await sleep(HTTP_THROTTLE_MS);

      const older = [];
      for (const p of posts) {
        const v = feed.get(Number(p.mid));
        if (v != null) saveViews(p, v);
        else older.push(p); // feed penceresi dışında → embed ile
      }

      // 2) Feed'de olmayan eski postlar için tek tek embed (bütçeli)
      for (const p of older) {
        if (embedBudget <= 0) break;
        embedBudget--;
        try {
          const v = await fetchSinglePostViews(username, p.mid);
          if (v != null) saveViews(p, v);
        } catch (e) {
          console.warn(`[views] embed hata @${username}/${p.mid}: ${e.message}`);
        }
        await sleep(HTTP_THROTTLE_MS);
      }
    }
    console.log(`[views] ${candidates.length} post güncellendi (${byChannel.size} kanal)`);
  } catch (e) {
    console.error('[views] pollViews hata:', e.message);
  } finally {
    pollingViews = false;
  }
}

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
    // Atomik claim — aynı postu iki tick/instance göndermesin.
    // status='pending' → 'sending' geçişi tek bir yazana başarır.
    const claim = db
      .prepare(`UPDATE posts SET status = 'sending' WHERE id = ? AND status = 'pending'`)
      .run(post.id);
    if (claim.changes !== 1) continue; // başka biri kaptı

    try {
      const channel = { chat_id: post.channel_chat_id, name: post.channel_name };

      // Havuz bağlıysa içeriği havuzdan çöz (sıralı/rastgele)
      let poolPickRes = null;
      let sendable = post;
      if (post.pool_id) {
        poolPickRes = poolPick(post.pool_id, post.pool_rotation);
        if (!poolPickRes) throw new Error('İçerik havuzu boş ya da bulunamadı');
        sendable = mergePoolItem(post, poolPickRes.item);
      }

      const result = await sendPost(sendable, channel);
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
      if (poolPickRes) poolPickRes.advance(); // sıralı havuzda imleci ilerlet
      audit('system', 'post.send', 'post', post.id, `${post.channel_name} (zamanlı)`);
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
           time_range_minutes, series_id, occurrence_num, max_occurrences, recurrence_end,
           pool_id, pool_rotation)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          post.pool_id || null,
          post.pool_rotation || null,
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
          `UPDATE posts SET status = 'pending', attempts = ?, error = ?, scheduled_at = ? WHERE id = ?`,
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
        audit('system', 'post.send_fail', 'post', post.id, errMsg);
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

let ticking = false; // aynı instance'ta üst üste binen tick'leri engelle

async function tick() {
  if (ticking) return; // önceki tick hâlâ sürüyorsa atla
  ticking = true;
  try {
    await processPendingPosts();
    await processAutoDeletes();
  } catch (e) {
    console.error('[scheduler] döngü hatası:', e);
  } finally {
    ticking = false;
  }
}

function start() {
  // Crash recovery: yarıda kalan 'sending' postları tekrar kuyruğa al
  try {
    const rec = db.prepare(`UPDATE posts SET status = 'pending' WHERE status = 'sending'`).run();
    if (rec.changes) console.log(`[scheduler] ${rec.changes} yarım kalan gönderim kurtarıldı`);
  } catch (e) {
    console.error('[scheduler] recovery hatası:', e.message);
  }

  // Her dakika kontrol — pending postlar + auto-delete birlikte (tek seferde bir tick)
  cron.schedule('* * * * *', tick);
  console.log('[scheduler] Başlatıldı (her dakika kontrol ediyor)');
  tick(); // ilk açılışta hemen

  // View takibi — 5 dakikada bir (yaş katmanı içeride hangi postun "due" olduğunu belirler)
  if (VIEW_SCRAPING_ON) {
    cron.schedule('*/5 * * * *', () => pollViews().catch((e) => console.error('[views] döngü:', e.message)));
    console.log(`[scheduler] View takibi açık (t.me/s, ${VIEW_TRACKING_DAYS} gün pencere)`);
    setTimeout(() => pollViews().catch(() => {}), 20_000); // açılıştan ~20sn sonra ilk tur
  }
}

module.exports = { start, processPendingPosts, processAutoDeletes, nextCronDate };
