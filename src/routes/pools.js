const express = require('express');
const { db } = require('../db');
const { audit, actorOf } = require('../audit');

const router = express.Router();

// Havuzları öğe sayısıyla listele
router.get('/', (_req, res) => {
  const pools = db
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM pool_items i WHERE i.pool_id = p.id) AS item_count
       FROM pools p ORDER BY p.created_at DESC`,
    )
    .all();
  res.json(pools);
});

// Tek havuz + öğeleri
router.get('/:id', (req, res) => {
  const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(req.params.id);
  if (!pool) return res.status(404).json({ error: 'Havuz yok' });
  const items = db
    .prepare('SELECT * FROM pool_items WHERE pool_id = ? ORDER BY position ASC, id ASC')
    .all(pool.id);
  res.json({ ...pool, items });
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name zorunlu' });
  const r = db.prepare('INSERT INTO pools (name) VALUES (?)').run(name);
  audit(actorOf(req), 'pool.create', 'pool', r.lastInsertRowid, name);
  res.json({ id: r.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name zorunlu' });
  db.prepare('UPDATE pools SET name = ? WHERE id = ?').run(name, req.params.id);
  audit(actorOf(req), 'pool.update', 'pool', req.params.id, name);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM pools WHERE id = ?').run(req.params.id); // items cascade
  audit(actorOf(req), 'pool.delete', 'pool', req.params.id, null);
  res.json({ ok: true });
});

// --- Havuz öğeleri ---
router.post('/:id/items', (req, res) => {
  const pool = db.prepare('SELECT id FROM pools WHERE id = ?').get(req.params.id);
  if (!pool) return res.status(404).json({ error: 'Havuz yok' });
  const { text, photo_path, media_type, media_group, buttons } = req.body || {};
  if (!text && !photo_path && !media_group) {
    return res.status(400).json({ error: 'Metin veya medya zorunlu' });
  }
  const maxPos = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM pool_items WHERE pool_id = ?')
    .get(pool.id).m;
  const r = db
    .prepare(
      `INSERT INTO pool_items (pool_id, text, photo_path, media_type, media_group, buttons, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      pool.id,
      text || '',
      photo_path || null,
      media_type || (photo_path ? 'photo' : 'text'),
      media_group ? JSON.stringify(media_group) : null,
      buttons ? JSON.stringify(buttons) : null,
      maxPos + 1,
    );
  res.json({ id: r.lastInsertRowid });
});

router.put('/items/:itemId', (req, res) => {
  const item = db.prepare('SELECT * FROM pool_items WHERE id = ?').get(req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Öğe yok' });
  const { text, photo_path, media_type, media_group, buttons } = req.body || {};
  db.prepare(
    `UPDATE pool_items SET text = ?, photo_path = ?, media_type = ?, media_group = ?, buttons = ? WHERE id = ?`,
  ).run(
    text ?? item.text,
    photo_path !== undefined ? photo_path : item.photo_path,
    media_type ?? item.media_type,
    media_group !== undefined ? (media_group ? JSON.stringify(media_group) : null) : item.media_group,
    buttons !== undefined ? (buttons ? JSON.stringify(buttons) : null) : item.buttons,
    req.params.itemId,
  );
  res.json({ ok: true });
});

router.delete('/items/:itemId', (req, res) => {
  db.prepare('DELETE FROM pool_items WHERE id = ?').run(req.params.itemId);
  res.json({ ok: true });
});

module.exports = router;
