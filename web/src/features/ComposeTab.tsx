import { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Code, EyeOff, Link as LinkIcon,
  ImageIcon, Plus, Trash2, Send, CalendarClock, Loader2, Sparkles,
  Film, FileText, Layers, Clock, Repeat as RepeatIcon, GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type {
  Channel, Template, ButtonGrid, ComposeDraft, MediaType, MediaGroupItem, UploadResult,
} from '@/lib/types';
import { localInputToISO, toLocalInputValue } from '@/lib/utils';
import { TelegramPreview } from './TelegramPreview';

const QUICK_EMOJIS = ['🎰', '🎁', '💰', '⚽', '🔥', '✅', '🚀', '💎', '🏆', '🎯', '⚡', '🎊'];

const CRON_PRESETS: { label: string; value: string; hint: string }[] = [
  { label: 'Hafta içi öğlen', value: '0 12 * * 1-5', hint: 'Pzt-Cuma 12:00' },
  { label: 'Hafta sonu sabah', value: '0 10 * * 0,6', hint: 'Cmt-Paz 10:00' },
  { label: 'Her Cuma 18:00', value: '0 18 * * 5', hint: 'Cuma 18:00' },
  { label: 'Her ayın 1\'i 09:00', value: '0 9 1 * *', hint: 'Ayın 1\'i 09:00' },
  { label: 'Her gün 09 ve 18', value: '0 9,18 * * *', hint: 'Sabah & akşam' },
  { label: 'Her 30 dakikada', value: '*/30 * * * *', hint: 'Çok sık' },
];

interface Props {
  channels: Channel[];
  templates: Template[];
  onSaved: () => void;
}

const emptyDraft = (channelId: number | null): ComposeDraft => ({
  channel_id: channelId,
  text: '',
  media_type: 'text',
  photo_path: null,
  photo_url: null,
  media_group: [],
  buttons: [],
  scheduled_at: toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000)),
  recurring: '',
  cron_expression: '',
  auto_delete_minutes: null,
  silent: false,
  disable_preview: false,
});

export function ComposeTab({ channels, templates, onSaved }: Props) {
  const [draft, setDraft] = useState<ComposeDraft>(emptyDraft(channels[0]?.id ?? null));
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const multiFileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!draft.channel_id && channels[0]) {
      setDraft((d) => ({ ...d, channel_id: channels[0].id }));
    }
  }, [channels, draft.channel_id]);

  const selectedChannel = channels.find((c) => c.id === draft.channel_id) || null;

  function update<K extends keyof ComposeDraft>(key: K, value: ComposeDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function wrap(tag: string) {
    const ta = textRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.slice(start, end) || '';
    const open = `<${tag}>`;
    const close = `</${tag}>`;
    const next = ta.value.slice(0, start) + open + sel + close + ta.value.slice(end);
    update('text', next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + open.length + sel.length + close.length;
      ta.setSelectionRange(cursor, cursor);
    });
  }

  function insertLink() {
    const url = prompt('Link URL:');
    if (!url) return;
    const ta = textRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = ta.value.slice(start, end) || 'link';
    const insert = `<a href="${url}">${sel}</a>`;
    update('text', ta.value.slice(0, start) + insert + ta.value.slice(end));
  }

  function insertPremiumEmoji() {
    const id = prompt(
      'Premium (Custom) Emoji ID:\n\nID öğrenmek için: bot\'a custom emoji içeren bir mesaj yaz/ilet.',
    );
    if (!id || !/^\d+$/.test(id.trim())) {
      if (id) alert('Geçersiz ID — sadece rakam olmalı');
      return;
    }
    const fallback = prompt('Fallback emoji:', '✨') || '✨';
    const ta = textRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const insert = `<tg-emoji emoji-id="${id.trim()}">${fallback}</tg-emoji>`;
    update('text', ta.value.slice(0, start) + insert + ta.value.slice(start));
  }

  function insertEmoji(e: string) {
    const ta = textRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    update('text', ta.value.slice(0, start) + e + ta.value.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      const c = start + e.length;
      ta.setSelectionRange(c, c);
    });
  }

  async function handleSingleUpload(file: File) {
    try {
      const r = await api.upload<UploadResult>('/api/posts/upload', file);
      update('photo_path', r.path);
      update('photo_url', r.url);
      update('media_type', r.media_type);
      update('media_group', []);
      const labels: Record<string, string> = {
        photo: '📷 Foto', video: '🎬 Video', animation: '🎞️ GIF',
        sticker: '✨ Sticker', document: '📄 Dosya', audio: '🎵 Ses',
      };
      toast.success(`Yüklendi: ${labels[r.media_type] || r.media_type}`, {
        description: 'Yanlış algılandıysa aşağıdan medya tipini değiştirebilirsin.',
      });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleMultiUpload(files: FileList) {
    const fd = new FormData();
    Array.from(files).slice(0, 10).forEach((f) => fd.append('files', f));
    try {
      const r = await fetch('/api/posts/upload-multi', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Yükleme hatası');
      const items: MediaGroupItem[] = data.files.map((f: UploadResult) => ({
        type: f.media_type === 'video' ? 'video' : 'photo',
        path: f.path,
        url: f.url,
      }));
      update('media_group', [...draft.media_group, ...items].slice(0, 10));
      update('media_type', 'media_group');
      update('photo_path', null);
      update('photo_url', null);
      toast.success(`${items.length} dosya albüme eklendi`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function clearMedia() {
    update('photo_path', null);
    update('photo_url', null);
    update('media_group', []);
    update('media_type', 'text');
  }

  function removeFromGroup(idx: number) {
    const next = draft.media_group.filter((_, i) => i !== idx);
    update('media_group', next);
    if (next.length === 0) update('media_type', 'text');
  }

  // --- Drag & drop ---
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (files.length === 1) handleSingleUpload(files[0]);
    else handleMultiUpload(files);
  }

  function addButton() {
    update('buttons', [...draft.buttons, [{ text: '', url: '' }]]);
  }
  function updateButton(rowIdx: number, btnIdx: number, field: 'text' | 'url', value: string) {
    const next: ButtonGrid = draft.buttons.map((row, ri) =>
      ri === rowIdx ? row.map((b, bi) => (bi === btnIdx ? { ...b, [field]: value } : b)) : row,
    );
    update('buttons', next);
  }
  function addButtonToRow(rowIdx: number) {
    const next = draft.buttons.map((row, ri) => (ri === rowIdx ? [...row, { text: '', url: '' }] : row));
    update('buttons', next);
  }
  function removeButton(rowIdx: number, btnIdx: number) {
    const next = draft.buttons
      .map((row, ri) => (ri === rowIdx ? row.filter((_, bi) => bi !== btnIdx) : row))
      .filter((row) => row.length > 0);
    update('buttons', next);
  }

  function applyTemplate(id: string) {
    const t = templates.find((t) => String(t.id) === id);
    if (!t) return;
    update('text', t.text);
    if (t.buttons) {
      try {
        update('buttons', JSON.parse(t.buttons));
      } catch {}
    }
    toast.success(`"${t.name}" şablonu uygulandı`);
  }

  async function submit(sendNow: boolean) {
    if (!draft.channel_id) return toast.error('Kanal seçin');
    const hasMedia = !!draft.photo_url || draft.media_group.length > 0;
    if (!draft.text.trim() && !hasMedia) return toast.error('Metin veya görsel ekleyin');

    setBusy(true);
    try {
      const scheduled = sendNow
        ? new Date(Date.now() - 1000).toISOString()
        : localInputToISO(draft.scheduled_at);

      const cleanButtons = draft.buttons
        .map((row) => row.filter((b) => b.text && b.url))
        .filter((row) => row.length > 0);

      const r = await api.post<{ id: number }>('/api/posts', {
        channel_id: draft.channel_id,
        text: draft.text,
        photo_path: draft.photo_path,
        media_type: draft.media_type,
        media_group: draft.media_group.length > 0
          ? draft.media_group.map(({ type, path, caption }) => ({ type, path, caption }))
          : null,
        buttons: cleanButtons.length ? cleanButtons : null,
        parse_mode: 'HTML',
        disable_preview: draft.disable_preview,
        silent: draft.silent,
        scheduled_at: scheduled,
        recurring: draft.recurring || null,
        cron_expression: draft.cron_expression.trim() || null,
        auto_delete_minutes: draft.auto_delete_minutes || null,
      });

      if (sendNow) {
        await api.post(`/api/posts/${r.id}/send-now`);
        toast.success('Gönderildi! 🚀');
      } else {
        toast.success('Zamanlandı 📅');
      }

      setDraft(emptyDraft(draft.channel_id));
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const formatBtns = [
    { tag: 'b', icon: Bold, title: 'Kalın' },
    { tag: 'i', icon: Italic, title: 'İtalik' },
    { tag: 'u', icon: Underline, title: 'Altı çizili' },
    { tag: 's', icon: Strikethrough, title: 'Üstü çizili' },
    { tag: 'code', icon: Code, title: 'Kod' },
    { tag: 'tg-spoiler', icon: EyeOff, title: 'Spoiler' },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_minmax(360px,400px)]">
      <Card>
        <CardHeader>
          <CardTitle>Yeni Gönderi</CardTitle>
          <CardDescription>HTML formatlama, emoji ve satır boşlukları aynen Telegram'a aktarılır.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Kanal</Label>
              <Select
                value={draft.channel_id ? String(draft.channel_id) : ''}
                onValueChange={(v) => update('channel_id', Number(v))}
              >
                <SelectTrigger><SelectValue placeholder="Kanal seç" /></SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} {c.username && `(@${c.username})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Şablon (opsiyonel)</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger><SelectValue placeholder="Şablon seç…" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Media area with drag & drop */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Medya</Label>
              <div className="flex gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/heic,video/*,.gif,.webp,.tgs,.mp4,.mov,application/pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSingleUpload(f);
                    e.target.value = ''; // aynı dosyayı tekrar seçebilmek için reset
                  }}
                />
                <input
                  ref={multiFileRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/*"
                  hidden
                  onChange={(e) => {
                    if (e.target.files) handleMultiUpload(e.target.files);
                    e.target.value = '';
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImageIcon className="mr-1 h-3.5 w-3.5" /> Tekli
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => multiFileRef.current?.click()}>
                  <Layers className="mr-1 h-3.5 w-3.5" /> Albüm
                </Button>
              </div>
            </div>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={
                'rounded-md border-2 border-dashed p-3 text-center text-xs text-muted-foreground transition ' +
                (dragOver ? 'border-primary bg-primary/10' : 'border-muted')
              }
            >
              {!draft.photo_url && draft.media_group.length === 0 && (
                <span>📥 Sürükle-bırak ile foto/video/GIF yükle • veya yukarıdaki butonları kullan</span>
              )}
              {draft.photo_url && (
                <div className="space-y-2 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {draft.media_type === 'video' ? (
                        <Film className="h-4 w-4 text-blue-400" />
                      ) : draft.media_type === 'animation' ? (
                        <Film className="h-4 w-4 text-purple-400" />
                      ) : draft.media_type === 'sticker' ? (
                        <Sparkles className="h-4 w-4 text-amber-400" />
                      ) : draft.media_type === 'document' ? (
                        <FileText className="h-4 w-4" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-emerald-400" />
                      )}
                      <span className="truncate text-xs">{draft.photo_path}</span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={clearMedia}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[11px] text-muted-foreground">Telegram'a şu olarak gönder:</Label>
                    <Select
                      value={draft.media_type}
                      onValueChange={(v) => update('media_type', v as MediaType)}
                    >
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="photo">📷 Foto (sıkıştırılmış)</SelectItem>
                        <SelectItem value="video">🎬 Video</SelectItem>
                        <SelectItem value="animation">🎞️ GIF / Animasyon</SelectItem>
                        <SelectItem value="sticker">✨ Sticker</SelectItem>
                        <SelectItem value="document">📄 Dosya (orijinal kalite)</SelectItem>
                        <SelectItem value="audio">🎵 Ses</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-[10px] text-muted-foreground">
                      Yanlış algılandıysa değiştir
                    </span>
                  </div>
                </div>
              )}
              {draft.media_group.length > 0 && (
                <div className="space-y-1 text-left">
                  <div className="flex items-center gap-2 text-foreground">
                    <Layers className="h-4 w-4" />
                    <span className="text-xs font-medium">
                      Albüm — {draft.media_group.length} öğe (max 10)
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 sm:grid-cols-8">
                    {draft.media_group.map((m, i) => (
                      <div key={i} className="group relative aspect-square overflow-hidden rounded">
                        {m.type === 'video' ? (
                          <video src={m.url} className="h-full w-full object-cover" muted />
                        ) : (
                          <img src={m.url} className="h-full w-full object-cover" alt="" />
                        )}
                        <button
                          onClick={() => removeFromGroup(i)}
                          className="absolute right-0.5 top-0.5 hidden rounded bg-black/60 p-0.5 group-hover:block"
                          type="button"
                        >
                          <Trash2 className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={clearMedia}>
                    <Trash2 className="mr-1 h-3 w-3" /> Albümü temizle
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mesaj Metni / Caption</Label>
            <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1">
              {formatBtns.map(({ tag, icon: Icon, title }) => (
                <Button key={tag} type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title={title} onClick={() => wrap(tag)}>
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title="Link" onClick={insertLink}>
                <LinkIcon className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-purple-400" title="Premium Emoji" onClick={insertPremiumEmoji}>
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
              <Separator orientation="vertical" className="mx-1 h-5" />
              {QUICK_EMOJIS.map((e) => (
                <Button key={e} type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-base" onClick={() => insertEmoji(e)}>
                  {e}
                </Button>
              ))}
            </div>
            <Textarea
              ref={textRef}
              value={draft.text}
              onChange={(e) => update('text', e.target.value)}
              rows={10}
              spellCheck={false}
              className="font-mono text-sm leading-relaxed"
              placeholder={`🎰 HOŞGELDİN BONUSU 🎰\n\n💰 İlk yatırımına %200 bonus\n🎁 50 Free Spin hediye`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Inline Butonlar</Label>
              <Button type="button" variant="outline" size="sm" onClick={addButton}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Satır Ekle
              </Button>
            </div>
            <div className="space-y-2">
              {draft.buttons.map((row, ri) => (
                <div key={ri} className="rounded-md border bg-muted/30 p-2">
                  {row.map((btn, bi) => (
                    <div key={bi} className="mb-1 flex gap-2 last:mb-0">
                      <Input placeholder="Buton metni" value={btn.text} onChange={(e) => updateButton(ri, bi, 'text', e.target.value)} />
                      <Input placeholder="https://example.com" value={btn.url} onChange={(e) => updateButton(ri, bi, 'url', e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeButton(ri, bi)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => addButtonToRow(ri)}>
                    + Aynı satıra buton
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tarih & Saat</Label>
              <Input type="datetime-local" value={draft.scheduled_at} onChange={(e) => update('scheduled_at', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tekrar (önayar)</Label>
              <Select
                value={draft.recurring || 'none'}
                onValueChange={(v) => update('recurring', (v === 'none' ? '' : v) as ComposeDraft['recurring'])}
              >
                <SelectTrigger><SelectValue placeholder="Tek seferlik" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tek seferlik</SelectItem>
                  <SelectItem value="hourly">Her saat</SelectItem>
                  <SelectItem value="daily">Her gün</SelectItem>
                  <SelectItem value="weekly">Her hafta</SelectItem>
                  <SelectItem value="monthly">Her ay</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Gelişmiş ayarlar — kapanıp açılır */}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAdvanced(!advanced)}
              className="text-xs text-muted-foreground"
            >
              {advanced ? '▼' : '▶'} Gelişmiş ayarlar (Custom cron, Auto-delete)
            </Button>
            {advanced && (
              <div className="mt-3 space-y-4 rounded-md border bg-muted/20 p-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <RepeatIcon className="h-3.5 w-3.5" /> Custom Cron Expression
                  </Label>
                  <Input
                    value={draft.cron_expression}
                    onChange={(e) => update('cron_expression', e.target.value)}
                    placeholder="0 12 * * 1-5  (hafta içi öğlen)"
                    className="font-mono"
                  />
                  <div className="flex flex-wrap gap-1">
                    {CRON_PRESETS.map((p) => (
                      <Button
                        key={p.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={() => update('cron_expression', p.value)}
                        title={p.hint}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Doluysa <code>Tekrar</code> önayarı yerine bu kullanılır. Format:
                    <code className="mx-1">dakika saat gün ay haftagünü</code>
                    (0=Pazar, 1-5=Pzt-Cuma)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Otomatik Sil (dakika)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      placeholder="Boş = silme"
                      value={draft.auto_delete_minutes ?? ''}
                      onChange={(e) =>
                        update('auto_delete_minutes', e.target.value ? Number(e.target.value) : null)
                      }
                      className="max-w-32"
                    />
                    {[15, 60, 360, 1440].map((m) => (
                      <Button
                        key={m}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => update('auto_delete_minutes', m)}
                      >
                        {m < 60 ? `${m}dk` : m === 1440 ? '1 gün' : `${m / 60}sa`}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Telegram, bot mesajlarını sadece <b>48 saat içinde</b> silebilir.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={draft.silent} onCheckedChange={(v) => update('silent', !!v)} />
              Sessiz gönder
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={draft.disable_preview} onCheckedChange={(v) => update('disable_preview', !!v)} />
              Link önizleme kapalı
            </label>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => submit(false)} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
              Zamanla
            </Button>
            <Button variant="secondary" onClick={() => submit(true)} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Hemen Gönder
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-20 h-fit">
        <CardHeader>
          <CardTitle>Önizleme</CardTitle>
          <CardDescription>Telegram'da bu şekilde görünecek.</CardDescription>
        </CardHeader>
        <CardContent>
          <TelegramPreview
            channel={selectedChannel}
            text={draft.text}
            mediaType={draft.media_type}
            photoUrl={draft.photo_url}
            mediaGroup={draft.media_group}
            buttons={draft.buttons}
            scheduledAt={draft.scheduled_at ? localInputToISO(draft.scheduled_at) : undefined}
            silent={draft.silent}
            autoDeleteMinutes={draft.auto_delete_minutes}
          />
        </CardContent>
      </Card>
    </div>
  );
}
