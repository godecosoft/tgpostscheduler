# ARS Telegram Scheduler

iGaming odaklı, web admin paneli + Telegram bot'u olan kanal gönderi planlama sistemi.

## Özellikler

- 🎯 **Çoklu kanal yönetimi** — TR, EN, vs. ayrı Telegram kanalları
- 📅 **Zamanlama** — tek seferlik veya tekrarlayan (saatlik/günlük/haftalık/aylık)
- 🎨 **HTML formatlama** — bold, italic, link, spoiler, kod
- 🖼️ **Görsel + caption** desteği
- 🔘 **Inline butonlar** — "Hemen Oyna", "Bonus Al" gibi (URL'li)
- 👁️ **Live Telegram preview** — yazdıkça nasıl görüneceğini telefon çerçevesinde göster
- 📋 **Şablonlar** — iGaming için ön tanımlı (Hoşgeldin Bonusu, Cashback, Free Spin, Maç önerisi)
- ✨ **Emoji & boşluk uyumu** — `white-space: pre-wrap` + UTF-8, mesaj Telegram'da yazdığın gibi gider
- 🔐 Session-based admin login

## Mimari

```
backend (Express + SQLite + node-telegram-bot-api + node-cron)
   │
   └── REST API  (/api/auth, /api/channels, /api/posts, /api/templates)
            ▲
            │
frontend (React + Vite + TypeScript + Tailwind + shadcn/ui)
```

## Kurulum

### 1. Backend

```bash
npm install
cp .env.example .env
# .env dosyasını düzenle:
#   - TELEGRAM_BOT_TOKEN  (BotFather'dan)
#   - ADMIN_USERNAME / ADMIN_PASSWORD
#   - SESSION_SECRET (uzun random string)
```

### 2. Frontend

```bash
cd web
npm install
```

### 3. Geliştirme

İki terminal:

```bash
# Terminal 1 — backend (port 3000)
npm run dev

# Terminal 2 — frontend (port 5173, /api → backend proxy)
cd web && npm run dev
```

Tarayıcıdan: http://localhost:5173

### 4. Production (lokal)

```bash
npm run build:web         # web/dist/ oluşur
npm start                  # backend hem API hem React build'i servis eder, port 3000
```

## Railway Deployment

Bu proje Railway için hazır gelir. `nixpacks.toml`, `railway.json` ve build script'leri kurulu.

### Adımlar

1. **GitHub repo:** Bu kodu GitHub'a push'la (zaten yapıldıysa atla).
2. **Railway → New Project → Deploy from GitHub** → repo'yu seç.
3. Railway otomatik:
   - Node 20 ile `npm install` çalıştırır.
   - `npm run build:web` ile React build'i alır.
   - `node src/server.js` ile başlatır.
4. **Environment Variables** (Railway dashboard → Variables):
   ```
   NODE_ENV=production
   SESSION_SECRET=<openssl rand -hex 32>
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=<güçlü parola>
   TELEGRAM_BOT_TOKEN=<BotFather token'ı>
   TZ=Europe/Istanbul
   DATA_DIR=/data
   UPLOAD_DIR=/data/uploads
   ```
5. **Volume ekle (önemli!)** — SQLite ve görsellerin deploy'lar arasında kaybolmaması için:
   - Railway → Service → Settings → **Volumes → New Volume**
   - Mount path: `/data`
   - Boyut: 1 GB yeterli (büyütülebilir)
6. **Deploy** → Railway public URL verir (örn. `https://tgpostscheduler-production.up.railway.app`).
7. URL'ye git → admin parolasıyla login.

### Telegram bot için not

Bot **polling modu** kullanır (long-polling). Railway'de webhook gerekmez, port açmaya gerek yok — out of the box çalışır.

### Health check

Railway servisin yaşadığını `/api/health` üzerinden kontrol eder (railway.json'da tanımlı).

## Telegram bot kurulumu

1. [@BotFather](https://t.me/BotFather) → `/newbot` → token al → `.env`'ye yapıştır.
2. Botu kanalına **yönetici** olarak ekle (mesaj gönderme yetkili).
3. Kanaldaki bota `/id` yaz → bot sana chat ID yazar (`-100…` ile başlar).
4. Web panelden "Kanallar" sekmesinden ekle (ya da bot eklendiğinde otomatik kayıtlanır).
5. "Test" butonuyla bağlantıyı doğrula.

## Klasör yapısı

```
.
├── src/                    # Express backend
│   ├── server.js           # entry point
│   ├── db.js               # SQLite + admin seed
│   ├── bot.js              # Telegram bot (polling)
│   ├── scheduler.js        # node-cron — her dakika pending post tarar
│   ├── middleware/auth.js
│   └── routes/
│       ├── auth.js
│       ├── channels.js
│       ├── posts.js        # CRUD + photo upload + send-now
│       └── templates.js
├── web/                    # React frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   └── Dashboard.tsx
│   │   ├── features/
│   │   │   ├── ComposeTab.tsx
│   │   │   ├── TelegramPreview.tsx   # ← canlı önizleme
│   │   │   ├── PostList.tsx
│   │   │   ├── ChannelsTab.tsx
│   │   │   └── TemplatesTab.tsx
│   │   ├── components/ui/  # shadcn bileşenleri
│   │   └── lib/
│   ├── tailwind.config.ts
│   └── vite.config.ts
├── data/scheduler.db       # SQLite (otomatik)
├── uploads/                # yüklenen görseller (otomatik)
└── .env
```

## Veri modeli

- `users` — admin kullanıcılar
- `channels` — Telegram kanalları (chat_id, ad, username, not)
- `templates` — yeniden kullanılabilir şablonlar
- `posts` — zamanlanmış / gönderilmiş mesajlar (status: pending/sent/failed, recurring desteği)

## Telegram HTML formatı

Backend `parse_mode: 'HTML'` kullanır. Desteklenen etiketler:

```
<b>kalın</b>  <i>italik</i>  <u>altı çizili</u>  <s>üstü çizili</s>
<code>kod</code>  <pre>blok kod</pre>
<a href="https://...">link</a>
<tg-spoiler>spoiler</tg-spoiler>
```

Önizleme bileşeni (`TelegramPreview.tsx`) **aynı kuralları sterilize ederek** render eder — preview ile gerçek mesaj birebir aynı görünür. Emoji ve satır boşlukları `white-space: pre-wrap` ile korunur.

## Notlar

- SQLite WAL modunda; tek node process'i için yeterli.
- `node-cron` her dakika `processPendingPosts` çalıştırır; `recurring` postlar gönderildikten sonra otomatik olarak bir sonraki tarihle yeniden eklenir.
- Foto yüklemeleri `uploads/` altına kaydedilir, `multer` ile (max 10 MB, sadece resim).
- Auth: `express-session` cookie tabanlı; production'da `cookie.secure = true` istiyorsan reverse proxy arkasında HTTPS açıp `app.set('trust proxy', 1)` ekle.
