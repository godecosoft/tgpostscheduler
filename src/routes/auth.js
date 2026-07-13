const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');

const router = express.Router();

const DEFAULT_PW = process.env.ADMIN_PASSWORD || 'admin';

// --- Basit in-memory brute-force koruması (IP başına) ---
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 dk penceresinde sayılır
const LOCK_MS = 15 * 60 * 1000; // kilitlenince 15 dk bekle
const attempts = new Map(); // ip -> { count, first, lockedUntil }

function clientIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function checkLock(ip) {
  const rec = attempts.get(ip);
  if (!rec) return { locked: false };
  if (rec.lockedUntil && rec.lockedUntil > Date.now()) {
    return { locked: true, retryAfter: Math.ceil((rec.lockedUntil - Date.now()) / 1000) };
  }
  // Pencere geçtiyse sıfırla
  if (rec.first && Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(ip);
  }
  return { locked: false };
}

function recordFail(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, first: now, lockedUntil: 0 };
  if (now - rec.first > WINDOW_MS) {
    rec.count = 0;
    rec.first = now;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCK_MS;
  }
  attempts.set(ip, rec);
}

function clearFails(ip) {
  attempts.delete(ip);
}

router.post('/login', (req, res) => {
  const ip = clientIp(req);
  const lock = checkLock(ip);
  if (lock.locked) {
    return res.status(429).json({
      error: `Çok fazla hatalı deneme. ${Math.ceil(lock.retryAfter / 60)} dk sonra tekrar deneyin.`,
    });
  }

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Eksik alan' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordFail(ip);
    return res.status(401).json({ error: 'Kullanıcı adı veya parola hatalı' });
  }
  clearFails(ip);
  req.session.userId = user.id;
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Yetkisiz' });
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.session.userId);
  // Parola hâlâ varsayılansa panelde uyarı göstermek için bayrak
  const defaultPassword = user ? bcrypt.compareSync(DEFAULT_PW, user.password_hash) : false;
  res.json({ username: req.session.username, default_password: defaultPassword });
});

// Parola değiştirme — mevcut parolayı doğrula, yenisini ata
router.post('/change-password', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Yetkisiz' });
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Mevcut ve yeni parola zorunlu' });
  }
  if (String(new_password).length < 8) {
    return res.status(400).json({ error: 'Yeni parola en az 8 karakter olmalı' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Mevcut parola hatalı' });
  }
  const hash = bcrypt.hashSync(String(new_password), 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  res.json({ ok: true });
});

module.exports = router;
