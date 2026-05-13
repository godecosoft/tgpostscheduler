const express = require('express');
const { db } = require('../db');
const { getBot } = require('../bot');

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
