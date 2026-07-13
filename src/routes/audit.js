const express = require('express');
const { db } = require('../db');

const router = express.Router();

// Son denetim kayıtları — ?limit, ?entity, ?actor filtreleri opsiyonel
router.get('/', (req, res) => {
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));
  const { entity, actor } = req.query;
  // at UTC olarak saklanır ("YYYY-MM-DD HH:MM:SS"); ISO-Z'ye çevir ki tarayıcı doğru yerelleştirsin
  let sql = `SELECT id, actor, action, entity, entity_id, detail,
             strftime('%Y-%m-%dT%H:%M:%SZ', at) AS at
             FROM audit_log WHERE 1=1`;
  const params = [];
  if (entity) { sql += ' AND entity = ?'; params.push(entity); }
  if (actor) { sql += ' AND actor = ?'; params.push(actor); }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
