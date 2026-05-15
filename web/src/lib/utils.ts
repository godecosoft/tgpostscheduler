import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toLocalInputValue(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToISO(value: string): string {
  // datetime-local → ISO (saat dilimiyle)
  return new Date(value).toISOString();
}

// --- Telegram HTML balance kontrolü (backend ile aynı mantık) ---
const ALLOWED_TG_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del',
  'code', 'pre', 'a', 'tg-spoiler', 'tg-emoji', 'blockquote', 'span',
]);

export interface HtmlIssue {
  type: 'orphan_close' | 'unclosed_open';
  tag: string;
  message: string;
}

export function checkTelegramHtml(text: string): HtmlIssue[] {
  if (!text) return [];
  const tagRe = /<(\/?)([\w-]+)(?:\s+[^>]*)?>/g;
  const issues: HtmlIssue[] = [];
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(text)) !== null) {
    const name = m[2].toLowerCase();
    if (!ALLOWED_TG_TAGS.has(name)) continue;
    const isClose = m[1] === '/';
    if (!isClose) {
      stack.push(name);
    } else {
      const idx = stack.lastIndexOf(name);
      if (idx === -1) {
        issues.push({
          type: 'orphan_close',
          tag: name,
          message: `Eşi olmayan </${name}> tag'i — Telegram reddeder`,
        });
      } else {
        stack.splice(idx, 1);
      }
    }
  }
  for (const tag of stack) {
    issues.push({
      type: 'unclosed_open',
      tag,
      message: `<${tag}> tag'i kapanmamış — gönderim sırasında otomatik kapatılır`,
    });
  }
  return issues;
}
