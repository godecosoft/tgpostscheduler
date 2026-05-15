/**
 * Telegram HTML parse_mode için izin verilen etiketler.
 */
const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del',
  'code', 'pre', 'a', 'tg-spoiler', 'tg-emoji', 'blockquote', 'span',
]);

/**
 * Metindeki tüm tag'leri stack ile dengeler:
 * - Eşi olmayan kapama tag'lerini siler (orphan)
 * - Sonda kapanmayan açık tag'leri kapatır
 *
 * Telegram'ın 400 "Unexpected end tag" / "Can't find end tag" hatalarını
 * önlemek için tasarlandı. Aşırı agresif değil — sadece syntax balansı düzeltir.
 *
 * @param {string} text
 * @returns {{ fixed: string, issues: Array<{type:string, message:string, snippet?:string}> }}
 */
function fixTelegramHtml(text) {
  if (!text || typeof text !== 'string') return { fixed: text || '', issues: [] };

  const issues = [];
  // <tag>, </tag>, <tag attr="..."> tüm formları yakala
  const tagRe = /<(\/?)([\w-]+)((?:\s+[^>]*)?)>/g;
  const tokens = [];
  let m;
  while ((m = tagRe.exec(text)) !== null) {
    const name = m[2].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue; // izinsiz tag'leri görmezden gel (zaten Telegram da reddeder)
    tokens.push({
      pos: m.index,
      len: m[0].length,
      raw: m[0],
      name,
      isClose: m[1] === '/',
      attrs: m[3] || '',
    });
  }

  // Stack tabanlı eşleştirme
  const stack = [];
  const orphanCloses = []; // silinecek pozisyonlar

  for (const tok of tokens) {
    if (!tok.isClose) {
      stack.push(tok);
      continue;
    }
    // Kapama tag'i — uygun açık tag'i bul (en yakın aynı isimli)
    let matchIdx = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name === tok.name) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx === -1) {
      // Eşi olmayan kapama tag'i — orphan, siliyoruz
      orphanCloses.push(tok);
      issues.push({
        type: 'orphan_close',
        message: `Eşi olmayan </${tok.name}> tag'i silindi`,
        snippet: tok.raw,
      });
    } else {
      stack.splice(matchIdx, 1);
    }
  }

  // Orphan'ları metinden çıkar (sondan başa, pozisyonlar bozulmasın diye)
  let result = text;
  orphanCloses.sort((a, b) => b.pos - a.pos);
  for (const o of orphanCloses) {
    result = result.slice(0, o.pos) + result.slice(o.pos + o.len);
  }

  // Stack'te kalan açık tag'leri sondan kapat
  for (let i = stack.length - 1; i >= 0; i--) {
    result += `</${stack[i].name}>`;
    issues.push({
      type: 'unclosed_open',
      message: `Kapanmamış <${stack[i].name}> tag'i sona kapatıldı`,
    });
  }

  return { fixed: result, issues };
}

/**
 * Sadece doğrulama (text'i değiştirmez). UI'da uyarı için.
 */
function validateTelegramHtml(text) {
  const { issues } = fixTelegramHtml(text);
  return {
    valid: issues.length === 0,
    issues,
  };
}

module.exports = { fixTelegramHtml, validateTelegramHtml };
