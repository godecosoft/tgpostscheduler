const cheerio = require('cheerio');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// "1.2K" / "3.9M" / "342" → tamsayı (Telegram <1000'i kesin, üstünü yuvarlar)
function parseCount(s) {
  if (!s) return null;
  const t = String(s).trim().replace(/[\s,]/g, '');
  const m = t.match(/^([\d.]+)\s*([KMB]?)/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const suf = (m[2] || '').toUpperCase();
  if (suf === 'K') n *= 1e3;
  else if (suf === 'M') n *= 1e6;
  else if (suf === 'B') n *= 1e9;
  return Math.round(n);
}

async function httpGet(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.text();
}

// Bir HTML blok listesinden mesaj → {msgId, views} eşlemesi çıkar
function parseMessages(html) {
  const $ = cheerio.load(html);
  const out = new Map(); // msgId(number) -> views(number)
  $('.tgme_widget_message').each((_i, el) => {
    const dp = $(el).attr('data-post'); // "kanal/123"
    if (!dp) return;
    const msgId = Number(dp.split('/')[1]);
    if (!msgId) return;
    const viewsText = $(el).find('.tgme_widget_message_views').first().text();
    const views = parseCount(viewsText);
    if (views != null) out.set(msgId, views);
  });
  return out;
}

// Kanalın public feed'i (son ~20 post). before verilirse ondan eski batch.
async function fetchChannelFeed(username, before) {
  const url = `https://t.me/s/${encodeURIComponent(username)}${before ? `?before=${before}` : ''}`;
  const html = await httpGet(url);
  return parseMessages(html); // Map<msgId, views>
}

// Tek bir postun view'ı (feed penceresi dışındaki eski postlar için)
async function fetchSinglePostViews(username, msgId) {
  const url = `https://t.me/${encodeURIComponent(username)}/${msgId}?embed=1&mode=tme`;
  const html = await httpGet(url);
  const map = parseMessages(html);
  return map.get(Number(msgId)) ?? null;
}

module.exports = { fetchChannelFeed, fetchSinglePostViews, parseCount };
