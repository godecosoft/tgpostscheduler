const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { sendPost } = require('../bot');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (video için)
  fileFilter: (_req, file, cb) => {
    // image, video, animation/gif, sticker (webp/tgs), audio, application (pdf vs.)
    if (/^(image|video|audio)\//.test(file.mimetype) ||
        file.mimetype === 'application/x-tgsticker' ||
        file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Desteklenmeyen dosya türü: ' + file.mimetype));
    }
  },
});

function detectMediaType(mimetype, filename) {
  if (/^image\/gif$/i.test(mimetype)) return 'animation';
  if (/^image\//i.test(mimetype)) return 'photo';
  if (/^video\//i.test(mimetype)) return 'video';
  if (/\.(tgs|webp)$/i.test(filename) || mimetype === 'application/x-tgsticker') return 'sticker';
  if (/^audio\//i.test(mimetype)) return 'audio';
  return 'document';
}

router.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
  const mediaType = detectMediaType(req.file.mimetype, req.file.originalname);
  res.json({
    path: req.file.filename,
    url: '/uploads/' + req.file.filename,
    media_type: mediaType,
    mime: req.file.mimetype,
    size: req.file.size,
  });
});

// Çoklu yükleme (media group için, max 10)
router.post('/upload-multi', upload.array('files', 10), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Dosya yok' });
  const files = req.files.map((f) => ({
    path: f.filename,
    url: '/uploads/' + f.filename,
    media_type: detectMediaType(f.mimetype, f.originalname),
    mime: f.mimetype,
    size: f.size,
  }));
  res.json({ files });
});

router.get('/', (req, res) => {
  const { status, channel_id } = req.query;
  let sql = `SELECT p.*, c.name as channel_name, c.username as channel_username
             FROM posts p JOIN channels c ON c.id = p.channel_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  if (channel_id) { sql += ' AND p.channel_id = ?'; params.push(channel_id); }
  sql += ' ORDER BY p.scheduled_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const post = db
    .prepare(
      `SELECT p.*, c.name as channel_name FROM posts p
       JOIN channels c ON c.id = p.channel_id WHERE p.id = ?`,
    )
    .get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Bulunamadı' });
  res.json(post);
});

router.post('/', (req, res) => {
  const {
    channel_id, text, photo_path, buttons, parse_mode,
    disable_preview, silent, scheduled_at, recurring,
    media_type, media_group, cron_expression, auto_delete_minutes,
  } = req.body || {};

  if (!channel_id || (!text && !photo_path && !media_group) || !scheduled_at) {
    return res.status(400).json({ error: 'channel_id, text/medya, scheduled_at zorunlu' });
  }
  const channel = db.prepare('SELECT id FROM channels WHERE id = ?').get(channel_id);
  if (!channel) return res.status(400).json({ error: 'Kanal bulunamadı' });

  const result = db
    .prepare(
      `INSERT INTO posts (channel_id, text, photo_path, buttons, parse_mode, disable_preview, silent,
       scheduled_at, recurring, media_type, media_group, cron_expression, auto_delete_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      channel_id,
      text || '',
      photo_path || null,
      buttons ? JSON.stringify(buttons) : null,
      parse_mode || 'HTML',
      disable_preview ? 1 : 0,
      silent ? 1 : 0,
      scheduled_at,
      recurring || null,
      media_type || (photo_path ? 'photo' : 'text'),
      media_group ? JSON.stringify(media_group) : null,
      cron_expression || null,
      auto_delete_minutes ? Number(auto_delete_minutes) : null,
    );
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Bulunamadı' });
  if (post.status === 'sent') return res.status(400).json({ error: 'Gönderilmiş post düzenlenemez' });

  const {
    channel_id, text, photo_path, buttons, parse_mode,
    disable_preview, silent, scheduled_at, recurring,
    media_type, media_group, cron_expression, auto_delete_minutes,
  } = req.body || {};

  db.prepare(
    `UPDATE posts SET channel_id = ?, text = ?, photo_path = ?, buttons = ?, parse_mode = ?,
     disable_preview = ?, silent = ?, scheduled_at = ?, recurring = ?,
     media_type = ?, media_group = ?, cron_expression = ?, auto_delete_minutes = ?,
     status = 'pending', error = NULL
     WHERE id = ?`,
  ).run(
    channel_id ?? post.channel_id,
    text ?? post.text,
    photo_path ?? post.photo_path,
    buttons ? JSON.stringify(buttons) : post.buttons,
    parse_mode ?? post.parse_mode,
    disable_preview ? 1 : 0,
    silent ? 1 : 0,
    scheduled_at ?? post.scheduled_at,
    recurring ?? post.recurring,
    media_type ?? post.media_type,
    media_group ? JSON.stringify(media_group) : post.media_group,
    cron_expression ?? post.cron_expression,
    auto_delete_minutes != null ? Number(auto_delete_minutes) : post.auto_delete_minutes,
    req.params.id,
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Hemen gönder
router.post('/:id/send-now', async (req, res) => {
  const post = db
    .prepare(
      `SELECT p.*, c.chat_id as channel_chat_id, c.name as channel_name FROM posts p
       JOIN channels c ON c.id = p.channel_id WHERE p.id = ?`,
    )
    .get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Bulunamadı' });

  try {
    const channel = { chat_id: post.channel_chat_id, name: post.channel_name };
    const result = await sendPost(post, channel);
    const messageId = Array.isArray(result)
      ? result[0]?.message_id || null
      : result?.message_id || null;

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
    res.json({ ok: true, message_id: messageId });
  } catch (err) {
    db.prepare(`UPDATE posts SET status = 'failed', error = ? WHERE id = ?`).run(err.message, post.id);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
