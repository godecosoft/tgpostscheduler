import { useMemo } from 'react';
import type { ButtonGrid, Channel } from '@/lib/types';

interface Props {
  channel?: Channel | null;
  text: string;
  photoUrl?: string | null;
  buttons: ButtonGrid;
  scheduledAt?: string;
  silent?: boolean;
}

/**
 * Telegram'ın HTML parse_mode için izin verdiği etiketleri sterilize eder.
 * Diğer her şey escape edilir. Bu sayede preview ↔ Telegram render eşit kalır.
 */
function renderTelegramHtml(raw: string): string {
  if (!raw) return '';
  // 1. Tüm tag karakterlerini escape et
  let s = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. İzin verilen etiketleri geri aç (case-insensitive, attr'siz veya href'li <a>)
  const allowed = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'tg-spoiler'];
  for (const tag of allowed) {
    const re = new RegExp(`&lt;(${tag})&gt;`, 'gi');
    s = s.replace(re, '<$1>');
    const reClose = new RegExp(`&lt;/(${tag})&gt;`, 'gi');
    s = s.replace(reClose, '</$1>');
  }
  // <a href="...">
  s = s.replace(/&lt;a\s+href=&quot;([^&]+)&quot;&gt;/gi, '<a href="$1" target="_blank" rel="noopener">');
  s = s.replace(/&lt;a\s+href=&#x27;([^&]+)&#x27;&gt;/gi, '<a href="$1" target="_blank" rel="noopener">');
  s = s.replace(/&lt;\/a&gt;/gi, '</a>');

  // <tg-emoji emoji-id="..."> — premium custom emoji
  // Preview'da fallback emoji + ✨ rozet (Telegram'da Premium kullanıcı animasyonlu görür)
  s = s.replace(
    /&lt;tg-emoji\s+emoji-id=&quot;(\d+)&quot;&gt;([^&]*?)&lt;\/tg-emoji&gt;/gi,
    '<span class="tg-premium-emoji" title="Premium emoji ID: $1">$2<sup>✨</sup></span>',
  );
  s = s.replace(
    /&lt;tg-emoji\s+emoji-id=&#x27;(\d+)&#x27;&gt;([^&]*?)&lt;\/tg-emoji&gt;/gi,
    '<span class="tg-premium-emoji" title="Premium emoji ID: $1">$2<sup>✨</sup></span>',
  );

  // <tg-spoiler> Telegram'da spoiler — preview'da blur efekti
  s = s.replace(/<tg-spoiler>/g, '<span class="tg-spoiler">');
  s = s.replace(/<\/tg-spoiler>/g, '</span>');

  return s;
}

function timeNow(scheduledAt?: string): string {
  const d = scheduledAt ? new Date(scheduledAt) : new Date();
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function TelegramPreview({ channel, text, photoUrl, buttons, scheduledAt, silent }: Props) {
  const html = useMemo(() => renderTelegramHtml(text), [text]);
  const charCount = text.length;
  const limit = photoUrl ? 1024 : 4096;
  const overLimit = charCount > limit;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {charCount} / {limit} karakter
          {overLimit && <span className="ml-2 text-destructive font-medium">Limit aşıldı!</span>}
        </span>
        {silent && <span className="text-amber-500">🔕 Sessiz</span>}
      </div>

      {/* Telefon çerçevesi */}
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border-4 border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Telegram başlık */}
        <div className="flex items-center gap-3 bg-[#17212b] px-4 py-3 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-lg font-bold">
            {(channel?.name || 'C').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{channel?.name || 'Kanal seçilmedi'}</div>
            <div className="truncate text-xs text-zinc-400">
              {channel?.username ? `@${channel.username.replace(/^@/, '')} · kanal` : 'kanal'}
            </div>
          </div>
        </div>

        {/* Sohbet zemini */}
        <div className="tg-chat-bg min-h-[420px] px-3 py-4">
          <div className="ml-auto max-w-[95%] rounded-2xl rounded-br-sm bg-[#2b5278] px-2 py-2 text-white shadow-md">
            {photoUrl && (
              <img
                src={photoUrl}
                alt=""
                className="mb-1 max-h-72 w-full rounded-xl object-cover"
              />
            )}
            <div
              className="tg-text px-2 pb-1 pt-1 text-[15px] leading-snug"
              dangerouslySetInnerHTML={{
                __html: html || '<span class="opacity-50">Mesaj yazınca burada görünür…</span>',
              }}
            />

            {buttons.length > 0 && (
              <div className="mt-2 space-y-1">
                {buttons.map((row, i) => (
                  <div key={i} className="flex gap-1">
                    {row.map((btn, j) => (
                      <a
                        key={j}
                        href={btn.url || '#'}
                        target="_blank"
                        rel="noopener"
                        className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-center text-xs font-medium text-white hover:bg-white/20"
                      >
                        {btn.text || '(buton)'}
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-1 px-2 pb-1 pt-0.5 text-[11px] text-zinc-300">
              <span>👁 1</span>
              <span>·</span>
              <span>{timeNow(scheduledAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .tg-spoiler {
          background: linear-gradient(120deg, #4a5260, #2c333f);
          color: transparent;
          border-radius: 4px;
          cursor: pointer;
          transition: color 0.2s;
        }
        .tg-spoiler:hover { color: #fff; background: transparent; }
        .tg-text a { color: #6ab3f3; text-decoration: none; }
        .tg-text a:hover { text-decoration: underline; }
        .tg-text code {
          background: rgba(0,0,0,0.3);
          padding: 1px 4px;
          border-radius: 3px;
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 0.92em;
        }
        .tg-text pre {
          background: rgba(0,0,0,0.3);
          padding: 8px;
          border-radius: 6px;
          overflow-x: auto;
          font-family: ui-monospace, SFMono-Regular, monospace;
          font-size: 0.92em;
        }
        .tg-premium-emoji {
          position: relative;
          display: inline-block;
          padding: 0 1px;
          background: linear-gradient(135deg, rgba(126, 87, 194, 0.25), rgba(33, 150, 243, 0.25));
          border-radius: 3px;
          cursor: help;
        }
        .tg-premium-emoji sup {
          font-size: 0.55em;
          margin-left: 1px;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
