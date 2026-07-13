const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'scheduler.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    chat_id TEXT UNIQUE NOT NULL,
    username TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    text TEXT NOT NULL,
    buttons TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    photo_path TEXT,
    buttons TEXT,
    parse_mode TEXT DEFAULT 'HTML',
    disable_preview INTEGER DEFAULT 0,
    silent INTEGER DEFAULT 0,
    scheduled_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    error TEXT,
    telegram_message_id INTEGER,
    recurring TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_posts_status_time ON posts(status, scheduled_at);

  CREATE TABLE IF NOT EXISTS post_stats_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    captured_at TEXT DEFAULT (datetime('now')),
    views INTEGER DEFAULT 0,
    reactions_total INTEGER DEFAULT 0,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_stats_post_time ON post_stats_history(post_id, captured_at);
`);

// --- Migration: yeni kolonlar (idempotent) ---
function safeAddColumn(table, column, definition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] migration: ${table}.${column} eklendi`);
  } catch (err) {
    if (!String(err.message).includes('duplicate column name')) throw err;
  }
}

safeAddColumn('posts', 'media_type', "TEXT DEFAULT 'text'"); // text|photo|video|animation|sticker|document|media_group
safeAddColumn('posts', 'media_group', 'TEXT'); // JSON array: [{type,path,caption?}]
safeAddColumn('posts', 'cron_expression', 'TEXT');
safeAddColumn('posts', 'auto_delete_minutes', 'INTEGER');
safeAddColumn('posts', 'delete_at', 'TEXT');
safeAddColumn('posts', 'views', 'INTEGER DEFAULT 0');
safeAddColumn('posts', 'reactions', 'TEXT'); // JSON: {"👍":12, "❤":5}
safeAddColumn('posts', 'last_stats_update', 'TEXT');
safeAddColumn('posts', 'time_range_minutes', 'INTEGER DEFAULT 0'); // rastgele dağıtım penceresi

// Şablonları kanal bazında kaydedebilmek için: NULL = genel (tüm kanallar)
safeAddColumn('templates', 'channel_id', 'INTEGER REFERENCES channels(id) ON DELETE CASCADE');
// Şablona tek medya (foto/video vs.) bağlama
safeAddColumn('templates', 'photo_path', 'TEXT');
safeAddColumn('templates', 'media_type', 'TEXT');

// Otomatik retry: kaç kez denendiği (kalıcı 'failed' olmadan önce)
safeAddColumn('posts', 'attempts', 'INTEGER DEFAULT 0');

// Recurring seri yönetimi
safeAddColumn('posts', 'series_id', 'TEXT'); // aynı tekrarlı serinin kimliği (ilk postun id'si)
safeAddColumn('posts', 'occurrence_num', 'INTEGER DEFAULT 1'); // bu, serinin kaçıncı gönderimi
safeAddColumn('posts', 'max_occurrences', 'INTEGER'); // NULL = sınırsız; N kez sonra dur
safeAddColumn('posts', 'recurrence_end', 'TEXT'); // ISO tarih; bu tarihten sonra üretme

// İçerik havuzu — tekrarlı postlar havuzdan sırayla/rastgele içerik çeker
db.exec(`
  CREATE TABLE IF NOT EXISTS pools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cursor INTEGER DEFAULT 0,   -- sıralı rotasyon için bir sonraki öğe indeksi
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS pool_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pool_id INTEGER NOT NULL,
    text TEXT,
    photo_path TEXT,
    media_type TEXT,
    media_group TEXT,
    buttons TEXT,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (pool_id) REFERENCES pools(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pool_items_pool ON pool_items(pool_id, position);
`);

// Bir tekrarlı postu bir havuza bağla
safeAddColumn('posts', 'pool_id', 'INTEGER');
safeAddColumn('posts', 'pool_rotation', "TEXT"); // sequential | random | shuffle
// shuffle (rastgele+tekrarsız) için mevcut turun karışık sırası (id JSON dizisi)
safeAddColumn('pools', 'shuffle_order', 'TEXT');

// Denetim günlüğü (audit log) — kim ne yaptı
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT DEFAULT (datetime('now')),
    actor TEXT,            -- kullanıcı adı ya da 'system'
    action TEXT NOT NULL,  -- örn: post.create, post.send, channel.delete, auth.login
    entity TEXT,           -- post | channel | template | auth
    entity_id TEXT,
    detail TEXT            -- serbest metin (kanal adı, hata, vs.)
  );
  CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
`);

// İlk admin kullanıcı setup
function ensureAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!existing) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    console.log(`[db] Admin kullanıcısı oluşturuldu: ${username}`);
  }
}

module.exports = { db, ensureAdmin };
