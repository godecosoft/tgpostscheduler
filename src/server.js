require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const { ensureAdmin } = require('./db');
const bot = require('./bot');
const scheduler = require('./scheduler');
const { requireAuth } = require('./middleware/auth');

const authRouter = require('./routes/auth');
const channelsRouter = require('./routes/channels');
const postsRouter = require('./routes/posts');
const { router: templatesRouter, seedDefaults } = require('./routes/templates');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

ensureAdmin();
seedDefaults();
bot.init();
scheduler.start();

// Railway / proxy arkasında HTTPS doğru algılanması için
if (isProd) app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd, // Railway HTTPS terminate ettiği için prod'da güvenli cookie
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

// Health check (Railway için)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Auth rotaları (public)
app.use('/api/auth', authRouter);

// Korumalı API
app.use('/api/channels', requireAuth, channelsRouter);
app.use('/api/posts', requireAuth, postsRouter);
app.use('/api/templates', requireAuth, templatesRouter);

// Yüklenen dosyalar (auth gerektirir) — env ile override edilebilir (Railway volume)
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
app.use('/uploads', requireAuth, express.static(UPLOAD_DIR));

// React (Vite) build çıktısı
const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  // SPA fallback — bilinmeyen rotaları index.html'e yönlendir
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .send(
        '<html><body style="font-family:sans-serif;padding:40px;max-width:600px;margin:auto"><h2>Frontend henüz build edilmemiş</h2><p>Çalıştır: <code>npm run build:web</code></p><p>Geliştirme için: <code>cd web && npm install && npm run dev</code> (Vite dev server :5173).</p></body></html>',
      );
  });
}

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on :${PORT} (${isProd ? 'production' : 'development'})`);
});
