const express = require('express');
const { db } = require('../db');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { name, text, buttons } = req.body || {};
  if (!name || !text) return res.status(400).json({ error: 'name ve text zorunlu' });
  const r = db
    .prepare('INSERT INTO templates (name, text, buttons) VALUES (?, ?, ?)')
    .run(name, text, buttons ? JSON.stringify(buttons) : null);
  res.json({ id: r.lastInsertRowid });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// İlk açılışta iGaming için ön tanımlı şablonları seed et
function seedDefaults() {
  const count = db.prepare('SELECT COUNT(*) as c FROM templates').get().c;
  if (count > 0) return;
  const defaults = [
    {
      name: '🎰 Hoşgeldin Bonusu',
      text: `🎰 <b>HOŞGELDİN BONUSU</b> 🎰

🎁 İlk yatırımına <b>%200 bonus</b>
💰 Maksimum <b>5.000 TL</b>'ye kadar
🔥 50 Free Spin hediye

⚡ Hemen kayıt ol, kazanmaya başla!`,
      buttons: [[{ text: '🎮 Hemen Oyna', url: 'https://example.com' }, { text: '💎 Bonus Al', url: 'https://example.com/bonus' }]],
    },
    {
      name: '⚽ Günün Maçları',
      text: `⚽ <b>GÜNÜN MAÇLARI</b> ⚽

🏆 Şampiyonlar Ligi
🇪🇸 Real Madrid - Barcelona
📊 Oran: <b>2.15</b>

🇮🇹 Inter - Milan
📊 Oran: <b>1.95</b>

🎯 En yüksek oranlarla bizde!`,
      buttons: [[{ text: '⚽ Bahis Yap', url: 'https://example.com/sport' }]],
    },
    {
      name: '💸 Haftalık Cashback',
      text: `💸 <b>HAFTALIK %20 CASHBACK</b>

📅 Pazartesi'ye kadar geçerli
💰 Limit: <b>10.000 TL</b>
⚡ Otomatik hesabına yatar

<i>Şartlar ve koşullar için sitemizi ziyaret edin.</i>`,
      buttons: [[{ text: '💰 Cashback Al', url: 'https://example.com/cashback' }]],
    },
    {
      name: '🎁 Free Spin Cuma',
      text: `🎁 <b>FREE SPIN CUMA!</b> 🎁

🎰 Bugün <b>100 Free Spin</b>
🎯 Sweet Bonanza & Gates of Olympus
💎 Minimum 50 TL yatırım

🚀 Şansını dene, jackpotu yakala!`,
      buttons: [[{ text: '🎰 Free Spin Al', url: 'https://example.com/freespin' }]],
    },
  ];
  const stmt = db.prepare('INSERT INTO templates (name, text, buttons) VALUES (?, ?, ?)');
  for (const t of defaults) stmt.run(t.name, t.text, JSON.stringify(t.buttons));
  console.log('[db] iGaming şablonları seed edildi');
}

module.exports = { router, seedDefaults };
