const express = require('express');
const { db } = require('./../db');

const router = express.Router();

// Genel sayaçlar + seçilen aralıkta grafik datası + top postlar
router.get('/dashboard', (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 7));
  const since = `-${days} days`;

  // Toplamlar (her zaman genel)
  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS total_posts,
        SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status='deleted' THEN 1 ELSE 0 END) AS deleted,
        COALESCE(SUM(views), 0) AS total_views
       FROM posts`,
    )
    .get();

  // Aralıkta — gönderilmiş post sayısı + o gün atılan postların view toplamı
  const lastWeek = db
    .prepare(
      `SELECT date(sent_at) AS day, COUNT(*) AS posts, COALESCE(SUM(views), 0) AS views
       FROM posts
       WHERE status='sent' AND sent_at >= datetime('now', ?)
       GROUP BY day ORDER BY day ASC`,
    )
    .all(since);

  // Reaction trendi (post_stats_history'den)
  const reactionsTrend = db
    .prepare(
      `SELECT date(captured_at) AS day, COALESCE(SUM(reactions_total), 0) AS reactions
       FROM post_stats_history
       WHERE captured_at >= datetime('now', ?)
       GROUP BY day ORDER BY day ASC`,
    )
    .all(since);

  // Top performing posts (aralıkta)
  const topPosts = db
    .prepare(
      `SELECT p.id, p.text, p.sent_at, p.views, p.reactions, c.name AS channel_name,
              p.media_type, p.telegram_message_id
       FROM posts p
       JOIN channels c ON c.id = p.channel_id
       WHERE p.status='sent' AND p.sent_at >= datetime('now', ?)
       ORDER BY (COALESCE(p.views,0) + COALESCE(LENGTH(p.reactions),0) * 5) DESC
       LIMIT 8`,
    )
    .all(since);

  // Kanal başına performans (aralıkta): post sayısı, view toplamı, ortalama view
  const perChannel = db
    .prepare(
      `SELECT c.id, c.name, c.username,
              COUNT(p.id) AS posts,
              COALESCE(SUM(p.views), 0) AS views,
              CAST(COALESCE(AVG(p.views), 0) AS INTEGER) AS avg_views
       FROM channels c
       LEFT JOIN posts p ON p.channel_id = c.id AND p.status='sent'
            AND p.sent_at >= datetime('now', ?)
       GROUP BY c.id
       ORDER BY views DESC`,
    )
    .all(since);

  res.json({ days, totals, lastWeek, reactionsTrend, topPosts, perChannel });
});

// Manuel view count girişi (Bot API view'i bot'a vermediği için
// admin opsiyonel olarak elle ya da MTProto entegrasyonu sonrası set edebilir)
router.post('/post/:id/views', (req, res) => {
  const views = Number(req.body?.views);
  if (!Number.isFinite(views) || views < 0) {
    return res.status(400).json({ error: 'views sayı olmalı' });
  }
  db.prepare(`UPDATE posts SET views = ?, last_stats_update = datetime('now') WHERE id = ?`).run(
    views,
    req.params.id,
  );
  // Snapshot
  db.prepare(`INSERT INTO post_stats_history (post_id, views, reactions_total) VALUES (?, ?, 0)`).run(
    req.params.id,
    views,
  );
  res.json({ ok: true });
});

module.exports = router;
