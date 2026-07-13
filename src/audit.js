const { db } = require('./db');

// Denetim kaydı ekle. actor yoksa 'system' (otomatik/scheduler eylemleri).
function audit(actor, action, entity, entityId, detail) {
  try {
    db.prepare(
      'INSERT INTO audit_log (actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)',
    ).run(actor || 'system', action, entity || null, entityId != null ? String(entityId) : null, detail || null);
  } catch (e) {
    console.error('[audit] kayıt hatası:', e.message);
  }
}

// Express req'ten aktör adını çıkar
function actorOf(req) {
  return req?.session?.username || 'system';
}

module.exports = { audit, actorOf };
