const { db } = require('./db');

// Bir havuzdan gönderilecek öğeyi seç.
// rotation='random' → rastgele; aksi halde sıralı (pools.cursor).
// Dönen { item, advance } — gönderim BAŞARILI olunca advance() çağrılır (sıralıda imleci ilerletir).
function poolPick(poolId, rotation) {
  const pool = db.prepare('SELECT * FROM pools WHERE id = ?').get(poolId);
  if (!pool) return null;
  const items = db
    .prepare('SELECT * FROM pool_items WHERE pool_id = ? ORDER BY position ASC, id ASC')
    .all(poolId);
  if (!items.length) return null;

  if (rotation === 'random') {
    const item = items[Math.floor(Math.random() * items.length)];
    return { item, advance: () => {} };
  }

  const idx = (pool.cursor || 0) % items.length;
  const item = items[idx];
  const next = (idx + 1) % items.length;
  return {
    item,
    advance: () => db.prepare('UPDATE pools SET cursor = ? WHERE id = ?').run(next, poolId),
  };
}

// Havuz öğesinin içeriğini post'un gönderim ayarlarıyla birleştir (gönderilebilir nesne).
function mergePoolItem(post, item) {
  return {
    ...post,
    text: item.text,
    photo_path: item.photo_path,
    media_type: item.media_type,
    media_group: item.media_group,
    buttons: item.buttons,
  };
}

module.exports = { poolPick, mergePoolItem };
