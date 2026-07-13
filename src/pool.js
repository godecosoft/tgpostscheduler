const { db } = require('./db');

// Fisher-Yates karıştırma
function shuffleArr(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Bir havuzdan gönderilecek öğeyi seç.
// rotation: 'random' → tamamen rastgele (tekrar olabilir)
//           'shuffle' → rastgele ama tur bitene kadar tekrarsız (shuffle-bag)
//           aksi halde 'sequential' → sıralı (pools.cursor)
// Dönen { item, advance } — gönderim BAŞARILI olunca advance() çağrılır (imleci/sırayı kalıcılaştırır).
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

  if (rotation === 'shuffle') {
    const ids = items.map((i) => i.id);
    let parsed = [];
    try { parsed = pool.shuffle_order ? JSON.parse(pool.shuffle_order) : []; } catch {}
    // Sadece hâlâ var olan öğeleri tut
    const order = Array.isArray(parsed) ? parsed.filter((id) => ids.includes(id)) : [];
    let cursor = pool.cursor || 0;

    // Tur bitti / boş / öğe silinmiş → yeniden karıştır
    const storedLen = Array.isArray(parsed) ? parsed.length : 0;
    const needReshuffle = order.length === 0 || cursor >= order.length || order.length !== storedLen;

    let seq = order;
    if (needReshuffle) {
      const prevLast = order.length ? order[Math.min(cursor, order.length) - 1] : null;
      seq = shuffleArr(ids);
      // Tur sınırında aynı postu üst üste getirme
      if (prevLast != null && seq.length > 1 && seq[0] === prevLast) {
        [seq[0], seq[1]] = [seq[1], seq[0]];
      }
      cursor = 0;
    }

    const chosenId = seq[cursor];
    const item = items.find((i) => i.id === chosenId) || items[0];
    const nextCursor = cursor + 1;
    const persist = JSON.stringify(seq);
    return {
      item,
      advance: () =>
        db.prepare('UPDATE pools SET shuffle_order = ?, cursor = ? WHERE id = ?').run(persist, nextCursor, poolId),
    };
  }

  // sequential (varsayılan)
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
