import { useMemo } from 'react';
import type { ButtonGrid, Channel, MediaGroupItem, MediaType } from '@/lib/types';

interface Props {
  channel?: Channel | null;
  text: string;
  mediaType?: MediaType;
  photoUrl?: string | null;
  mediaGroup?: MediaGroupItem[];
  buttons: ButtonGrid;
  scheduledAt?: string;
  silent?: boolean;
  autoDeleteMinutes?: number | null;
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

export function TelegramPreview({
  channel,
  text,
  mediaType,
  photoUrl,
  mediaGroup,
  buttons,
  scheduledAt,
  silent,
  autoDeleteMinutes,
}: Props) {
  const html = useMemo(() => renderTelegramHtml(text), [text]);
  const charCount = text.length;
  const hasCaption = !!photoUrl || mediaType === 'media_group' || mediaType === 'video' || mediaType === 'animation';
  const limit = hasCaption ? 1024 : 4096;
  const overLimit = charCount > limit;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {charCount} / {limit} karakter
          {overLimit && <span className="ml-2 text-destructive font-medium">Limit aşıldı!</span>}
        </span>
        <div className="flex items-center gap-2">
          {silent && <span className="text-amber-500">🔕 Sessiz</span>}
          {autoDeleteMinutes ? (
            <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-destructive">
              ⏱ {autoDeleteMinutes}dk sonra silinir
            </span>
          ) : null}
        </div>
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
            {/* Media render */}
            {mediaType === 'media_group' && mediaGroup && mediaGroup.length > 0 && (
              <div
                className={
                  'mb-1 grid gap-0.5 overflow-hidden rounded-xl ' +
                  (mediaGroup.length === 1
                    ? 'grid-cols-1'
                    : mediaGroup.length === 2
                    ? 'grid-cols-2'
                    : mediaGroup.length === 3
                    ? 'grid-cols-3'
                    : 'grid-cols-2')
                }
              >
                {mediaGroup.slice(0, 4).map((m, i) => (
                  <div key={i} className="relative aspect-square bg-black/30">
                    {m.type === 'video' ? (
                      <>
                        <video src={m.url} className="h-full w-full object-cover" muted />
                        <div className="absolute inset-0 flex items-center justify-center text-3xl">▶️</div>
                      </>
                    ) : (
                      <img src={m.url} alt="" className="h-full w-full object-cover" />
                    )}
                    {i === 3 && mediaGroup.length > 4 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-2xl font-bold">
                        +{mediaGroup.length - 4}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {mediaType !== 'media_group' && photoUrl && (
              <>
                {mediaType === 'video' && (
                  <video
                    src={photoUrl}
                    className="mb-1 max-h-72 w-full rounded-xl object-cover"
                    controls
                    muted
                  />
                )}
                {mediaType === 'animation' && (
                  <video
                    src={photoUrl}
                    className="mb-1 max-h-72 w-full rounded-xl object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                )}
                {mediaType === 'sticker' && (
                  <img src={photoUrl} alt="" className="mb-1 max-h-48 max-w-48 object-contain" />
                )}
                {mediaType === 'document' && (
                  <div className="mb-1 flex items-center gap-2 rounded-xl bg-black/20 p-2 text-xs">
                    <span className="text-2xl">📄</span>
                    <span className="truncate">Doküman</span>
                  </div>
                )}
                {(mediaType === 'photo' || !mediaType) && (
                  <img src={photoUrl} alt="" className="mb-1 max-h-72 w-full rounded-xl object-cover" />
                )}
              </>
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
