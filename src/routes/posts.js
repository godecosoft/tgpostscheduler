const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../db');
const { sendPost } = require('../bot');
const { audit, actorOf } = require('../audit');

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

// Bir dosya adı başka bir post tarafından hâlâ kullanılıyor mu?
function fileStillReferenced(filename) {
  if (!filename) return true; // boşsa dokunma
  const byPhoto = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE photo_path = ?').get(filename).c;
  if (byPhoto > 0) return true;
  const byGroup = db
    .prepare(`SELECT COUNT(*) AS c FROM posts WHERE media_group LIKE ?`)
    .get('%' + filename + '%').c;
  return byGroup > 0;
}

// Post silinince ilişkili upload dosyalarını diskten temizle (başka post kullanmıyorsa)
function cleanupPostFiles(post) {
  const names = new Set();
  if (post.photo_path) names.add(String(post.photo_path).replace(/^uploads[\\/]/, ''));
  if (post.media_group) {
    try {
      const group = JSON.parse(post.media_group);
      if (Array.isArray(group)) {
        for (const item of group) {
          if (item?.path) names.add(String(item.path).replace(/^uploads[\\/]/, ''));
        }
      }
    } catch {}
  }
  for (const name of names) {
    if (fileStillReferenced(name)) continue;
    const full = path.join(UPLOAD_DIR, name);
    fs.unlink(full, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error('[posts] upload silme hatası:', name, err.message);
      } else if (!err) {
        console.log('[posts] upload temizlendi:', name);
      }
    });
  }
}

function detectMediaType(mimetype, filename) {
  const mt = String(mimetype || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';

  // 1) GIF — animation (her iki sinyal de)
  if (mt === 'image/gif' || ext === 'gif') return 'animation';

  // 2) Telegram sticker — sadece .tgs (animated) ya da explicit sticker mime
  // .webp → kullanıcı isterse sticker, ama default photo (sticker manual override için bırak)
  if (ext === 'tgs' || mt === 'application/x-tgsticker') return 'sticker';

  // 3) Photo — image/* (gif hariç)
  if (mt.startsWith('image/')) return 'photo';
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'heic', 'heif'].includes(ext)) return 'photo';

  // 4) Video
  if (mt.startsWith('video/')) return 'video';
  if (['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp'].includes(ext)) return 'video';

  // 5) Audio
  if (mt.startsWith('audio/')) return 'audio';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'opus', 'aac'].includes(ext)) return 'audio';

  // 6) Bilinmiyorsa document (PDF vb.)
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
    time_range_minutes, max_occurrences, recurrence_end,
  } = req.body || {};

  if (!channel_id || (!text && !photo_path && !media_group) || !scheduled_at) {
    return res.status(400).json({ error: 'channel_id, text/medya, scheduled_at zorunlu' });
  }
  const channel = db.prepare('SELECT id FROM channels WHERE id = ?').get(channel_id);
  if (!channel) return res.status(400).json({ error: 'Kanal bulunamadı' });

  const result = db
    .prepare(
      `INSERT INTO posts (channel_id, text, photo_path, buttons, parse_mode, disable_preview, silent,
       scheduled_at, recurring, media_type, media_group, cron_expression, auto_delete_minutes,
       time_range_minutes, occurrence_num, max_occurrences, recurrence_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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
      time_range_minutes ? Number(time_range_minutes) : 0,
      max_occurrences ? Number(max_occurrences) : null,
      recurrence_end || null,
    );
  // Tekrarlı seri ise kendi id'sini series_id yap (occurrence'lar bunu paylaşır)
  if (cron_expression || recurring) {
    db.prepare('UPDATE posts SET series_id = ? WHERE id = ?').run(
      String(result.lastInsertRowid),
      result.lastInsertRowid,
    );
  }
  audit(actorOf(req), 'post.create', 'post', result.lastInsertRowid, cron_expression ? 'tekrarlı' : 'tek seferlik');
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
    time_range_minutes, max_occurrences, recurrence_end,
  } = req.body || {};

  db.prepare(
    `UPDATE posts SET channel_id = ?, text = ?, photo_path = ?, buttons = ?, parse_mode = ?,
     disable_preview = ?, silent = ?, scheduled_at = ?, recurring = ?,
     media_type = ?, media_group = ?, cron_expression = ?, auto_delete_minutes = ?,
     time_range_minutes = ?, max_occurrences = ?, recurrence_end = ?,
     status = 'pending', error = NULL, attempts = 0
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
    time_range_minutes != null ? Number(time_range_minutes) : (post.time_range_minutes || 0),
    max_occurrences !== undefined ? (max_occurrences ? Number(max_occurrences) : null) : post.max_occurrences,
    recurrence_end !== undefined ? (recurrence_end || null) : post.recurrence_end,
    req.params.id,
  );
  audit(actorOf(req), 'post.update', 'post', req.params.id, null);
  res.json({ ok: true });
});

// Tekrarlı seriyi duraklat — bekleyen occurrence'ı 'paused' yap (scheduler atlar)
router.post('/:id/pause', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Bulunamadı' });
  if (post.status !== 'pending') return res.status(400).json({ error: 'Sadece bekleyen post duraklatılabilir' });
  db.prepare(`UPDATE posts SET status = 'paused' WHERE id = ?`).run(req.params.id);
  audit(actorOf(req), 'post.pause', 'post', req.params.id, null);
  res.json({ ok: true });
});

// Duraklatılmış seriyi devam ettir — 'pending' yap
router.post('/:id/resume', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Bulunamadı' });
  if (post.status !== 'paused') return res.status(400).json({ error: 'Sadece duraklatılmış post devam ettirilebilir' });
  db.prepare(`UPDATE posts SET status = 'pending' WHERE id = ?`).run(req.params.id);
  audit(actorOf(req), 'post.resume', 'post', req.params.id, null);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const post = db.prepare('SELECT photo_path, media_group FROM posts WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  if (post) cleanupPostFiles(post); // silmeden sonra: artık referans sayımına dahil değil
  audit(actorOf(req), 'post.delete', 'post', req.params.id, null);
  res.json({ ok: true });
});

// Başarısız bir postu yeniden dene (status'u pending'e al, scheduled_at'i şimdiye, sayaç sıfır)
router.post('/:id/retry', (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Bulunamadı' });
  db.prepare(
    `UPDATE posts SET status = 'pending', error = NULL, attempts = 0, scheduled_at = datetime('now') WHERE id = ?`,
  ).run(req.params.id);
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

  // Atomik claim — scheduler ile aynı anda göndermeyi engelle
  const claim = db
    .prepare(`UPDATE posts SET status = 'sending' WHERE id = ? AND status IN ('pending','paused','failed')`)
    .run(post.id);
  if (claim.changes !== 1) {
    return res.status(409).json({ error: 'Bu gönderim şu an işleniyor ya da zaten gönderilmiş' });
  }

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
    audit(actorOf(req), 'post.send', 'post', post.id, `${post.channel_name} (elle)`);
    res.json({ ok: true, message_id: messageId });
  } catch (err) {
    db.prepare(`UPDATE posts SET status = 'failed', error = ? WHERE id = ?`).run(err.message, post.id);
    audit(actorOf(req), 'post.send_fail', 'post', post.id, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
