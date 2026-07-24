/**
 * Userbot giriş scripti — TELEGRAM_SESSION üretir.
 *
 * Bir KEZ, LOKALDE çalıştır. Telefon numaran + Telegram'dan gelen kodu (ve varsa
 * 2FA parolanı) girersin; çıktı olarak uzun bir SESSION string alırsın. Bunu
 * Railway → Variables → TELEGRAM_SESSION içine yapıştır.
 *
 * ÖN KOŞUL: my.telegram.org → "API development tools" → api_id ve api_hash al.
 *
 * Çalıştırma (izole klasörde önerilir — projenin better-sqlite3 derlemesine takılmadan):
 *   mkdir tg-login && cd tg-login
 *   npm init -y
 *   npm install telegram
 *   # bu dosyayı buraya kopyala, sonra:
 *   node userbot-login.js
 *
 * Güvenlik: Telefon/kod/parola SENİN elinde kalır; çıktı SESSION'ı gizli tut
 * (hesabına tam erişim verir). Sadece Railway env'ine koy, koda/gite yazma.
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

(async () => {
  try {
    const apiId = Number(process.env.TELEGRAM_API_ID || (await ask('api_id: ')));
    const apiHash = String(process.env.TELEGRAM_API_HASH || (await ask('api_hash: ')));

    if (!apiId || !apiHash) {
      console.error('api_id ve api_hash zorunlu (my.telegram.org).');
      process.exit(1);
    }

    const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.start({
      phoneNumber: async () => await ask('Telefon (ör. +905551112233): '),
      password: async () => await ask('2FA parolası (yoksa boş bırak, Enter): '),
      phoneCode: async () => await ask('Telegram uygulamasına gelen kod: '),
      onError: (err) => console.error('Giriş hatası:', err?.message || err),
    });

    const me = await client.getMe();
    console.log(`\nGiriş başarılı: ${me?.username ? '@' + me.username : me?.firstName} ${me?.premium ? '(Premium ✅)' : '(Premium DEĞİL ⚠️ — premium emoji çalışmaz)'}`);

    console.log('\n=================== TELEGRAM_SESSION ===================\n');
    console.log(client.session.save());
    console.log('\n========================================================');
    console.log('Bunu Railway → Variables → TELEGRAM_SESSION içine yapıştır.');
    console.log('GİZLİ tut: hesabına tam erişim verir.\n');

    await client.disconnect();
    rl.close();
    process.exit(0);
  } catch (e) {
    console.error('Hata:', e?.message || e);
    rl.close();
    process.exit(1);
  }
})();
