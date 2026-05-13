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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Sadece resim dosyası kabul edilir'));
  },
});

router.post('/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
  // DB'de sadece dosya adı saklanır; gerçek disk yolu UPLOAD_DIR ile birleştirilir
  res.json({ path: req.file.filename, url: '/uploads/' + req.file.filename });
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
  } = req.body || {};

  if (!channel_id || !text || !scheduled_at) {
    return res.status(400).json({ error: 'channel_id, text, scheduled_at zorunlu' });
  }
  const channel = db.prepare('SELECT id FROM channels WHERE id = ?').get(channel_id);
  if (!channel) return res.status(400).json({ error: 'Kanal bulunamadı' });

  const result = db
    .prepare(
      `INSERT INTO posts (channel_id, text, photo_path, buttons, parse_mode, disable_preview, silent, scheduled_at, recurring)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      channel_id,
      text,
      photo_path || null,
      buttons ? JSON.stringify(buttons) : null,
      parse_mode || 'HTML',
      disable_preview ? 1 : 0,
      silent ? 1 : 0,
      scheduled_at,
      recurring || null,
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
  } = req.body || {};

  db.prepare(
    `UPDATE posts SET channel_id = ?, text = ?, photo_path = ?, buttons = ?, parse_mode = ?,
     disable_preview = ?, silent = ?, scheduled_at = ?, recurring = ?, status = 'pending', error = NULL
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
    db.prepare(
      `UPDATE posts SET status = 'sent', sent_at = datetime('now'), telegram_message_id = ?, error = NULL WHERE id = ?`,
    ).run(result.message_id || null, post.id);
    res.json({ ok: true, message_id: result.message_id });
  } catch (err) {
    db.prepare(`UPDATE posts SET status = 'failed', error = ? WHERE id = ?`).run(err.message, post.id);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
