const express = require('express');
const { db } = require('../db');
const { getBot, getBotInfo } = require('../bot');

const router = express.Router();

router.get('/', (req, res) => {
  const channels = db.prepare('SELECT * FROM channels ORDER BY created_at DESC').all();
  res.json(channels);
});

router.post('/', (req, res) => {
  const { name, chat_id, username, note } = req.body || {};
  if (!name || !chat_id) return res.status(400).json({ error: 'name ve chat_id zorunlu' });
  try {
    const result = db
      .prepare('INSERT INTO channels (name, chat_id, username, note) VALUES (?, ?, ?, ?)')
      .run(name, String(chat_id), username || null, note || null);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Bu chat_id zaten kayıtlı' });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, chat_id, username, note } = req.body || {};
  db.prepare('UPDATE channels SET name = ?, chat_id = ?, username = ?, note = ? WHERE id = ?').run(
    name,
    String(chat_id),
    username || null,
    note || null,
    req.params.id,
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Sağlık kontrolü: bot kanalda admin mi, mesaj gönderebiliyor mu?
router.get('/:id/health', async (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Kanal yok' });
  const bot = getBot();
  if (!bot) return res.json({ ok: false, error: 'Bot başlatılmamış (token eksik)' });
  try {
    const me = getBotInfo() || (await bot.getMe());
    const member = await bot.getChatMember(channel.chat_id, me.id);
    const status = member.status; // creator|administrator|member|restricted|left|kicked
    const isAdmin = status === 'administrator' || status === 'creator';
    // Kanallarda admin için can_post_messages; tanımsızsa (creator) true kabul
    const canPost = isAdmin && member.can_post_messages !== false;
    res.json({
      ok: true,
      status,
      is_admin: isAdmin,
      can_post: canPost,
      can_delete: !!member.can_delete_messages,
      can_edit: !!member.can_edit_messages,
    });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Test: kanala basit mesaj at
router.post('/:id/test', async (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Kanal yok' });
  const bot = getBot();
  if (!bot) return res.status(503).json({ error: 'Bot başlatılmamış' });
  try {
    await bot.sendMessage(channel.chat_id, '✅ Test mesajı — bot bağlantısı çalışıyor.');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
