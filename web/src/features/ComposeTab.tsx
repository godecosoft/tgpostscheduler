import { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Code, EyeOff, Link as LinkIcon,
  ImageIcon, Plus, Trash2, Send, CalendarClock, Loader2, Sparkles,
  Film, FileText, Layers, Clock, CalendarDays, Repeat,
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
  ScheduleMode, IntervalUnit, Post,
} from '@/lib/types';
import { localInputToISO, toLocalInputValue, checkTelegramHtml, formatDateTime } from '@/lib/utils';
import {
  buildCron, nextFirings, applyRandomOffset, nextFiringsWithRange, parseCronToSchedule,
  WEEKDAY_LABELS, SCHEDULE_MODE_LABELS,
} from '@/lib/schedule';
import { useCreatePost, useUpdatePost, useSendNow } from '@/hooks/usePosts';
import { useCreateTemplate } from '@/hooks/useTemplates';
import { TelegramPreview } from './TelegramPreview';

const QUICK_EMOJIS = ['🎰', '🎁', '💰', '⚽', '🔥', '✅', '🚀', '💎', '🏆', '🎯', '⚡', '🎊'];

interface Props {
  channels: Channel[];
  templates: Template[];
  editingPost?: Post | null;
  onCancelEdit?: () => void;
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
  schedule_mode: 'oneoff',
  interval_value: 1,
  interval_unit: 'hour',
  interval_time: '12:00',
  weekdays: [1], // default Pzt
  weekly_time: '12:00',
  monthly_day: 1,
  monthly_time: '12:00',
  cron_expression: '',
  time_range_minutes: 0,
  max_occurrences: null,
  recurrence_end: '',
  auto_delete_minutes: null,
  silent: false,
  disable_preview: false,
});

// Mevcut Post → ComposeDraft (edit için)
function postToDraft(p: Post): ComposeDraft {
  let buttons: ButtonGrid = [];
  try { buttons = p.buttons ? JSON.parse(p.buttons) : []; } catch {}
  let mediaGroup: MediaGroupItem[] = [];
  try {
    mediaGroup = p.media_group
      ? JSON.parse(p.media_group).map((m: any) => ({
          ...m, url: '/uploads/' + m.path,
        }))
      : [];
  } catch {}
  // Cron varsa üretildiği moda geri çöz (weekly/monthly/interval/custom korunur)
  const parsed = p.cron_expression ? parseCronToSchedule(p.cron_expression) : { schedule_mode: 'oneoff' as const };
  return {
    channel_id: p.channel_id,
    text: p.text || '',
    media_type: (p.media_type as MediaType) || 'text',
    photo_path: p.photo_path,
    photo_url: p.photo_path ? '/uploads/' + p.photo_path : null,
    media_group: mediaGroup,
    buttons,
    scheduled_at: toLocalInputValue(new Date(p.scheduled_at)),
    schedule_mode: parsed.schedule_mode ?? 'oneoff',
    interval_value: parsed.interval_value ?? 1,
    interval_unit: parsed.interval_unit ?? 'hour',
    interval_time: parsed.interval_time ?? '12:00',
    weekdays: parsed.weekdays ?? [1],
    weekly_time: parsed.weekly_time ?? '12:00',
    monthly_day: parsed.monthly_day ?? 1,
    monthly_time: parsed.monthly_time ?? '12:00',
    cron_expression: parsed.cron_expression ?? p.cron_expression ?? '',
    time_range_minutes: p.time_range_minutes || 0,
    max_occurrences: p.max_occurrences ?? null,
    recurrence_end: p.recurrence_end ? toLocalInputValue(new Date(p.recurrence_end)) : '',
    auto_delete_minutes: p.auto_delete_minutes,
    silent: !!p.silent,
    disable_preview: !!p.disable_preview,
  };
}

export function ComposeTab({ channels, templates, editingPost, onCancelEdit }: Props) {
  const [draft, setDraft] = useState<ComposeDraft>(emptyDraft(channels[0]?.id ?? null));
  const [busy, setBusy] = useState(false);
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const sendNowMutation = useSendNow();
  const createTemplate = useCreateTemplate();
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const multiFileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!draft.channel_id && channels[0]) {
      setDraft((d) => ({ ...d, channel_id: channels[0].id }));
    }
  }, [channels, draft.channel_id]);

  // Edit modu: gelen post'tan draft'ı hidrate et
  useEffect(() => {
    if (editingPost) {
      setDraft(postToDraft(editingPost));
      // Sayfa başına scroll
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [editingPost?.id]);

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

  // Mevcut gönderiyi (metin + butonlar) şablon olarak kaydet
  async function saveAsTemplate() {
    if (!draft.text.trim()) return toast.error('Önce metin girin');
    const name = prompt('Şablon adı:');
    if (!name) return;
    const cleanButtons = draft.buttons
      .map((row) => row.filter((b) => b.text && b.url))
      .filter((row) => row.length > 0);
    try {
      await createTemplate.mutateAsync({
        name,
        text: draft.text,
        buttons: cleanButtons.length ? cleanButtons : null,
        channel_id: draft.channel_id, // seçili kanala özel kaydeder
      });
      toast.success('Şablon kaydedildi');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function submit(sendNow: boolean) {
    if (!draft.channel_id) return toast.error('Kanal seçin');
    const hasMedia = !!draft.photo_url || draft.media_group.length > 0;
    if (!draft.text.trim() && !hasMedia) return toast.error('Metin veya görsel ekleyin');

    // Cron expression hesapla (oneoff dışında)
    const cron = buildCron(draft);

    // Validation: weekly modda en az 1 gün seçili olmalı
    if (draft.schedule_mode === 'weekly' && draft.weekdays.length === 0) {
      return toast.error('Haftalık modda en az 1 gün seçin');
    }
    if (draft.schedule_mode === 'custom' && !cron) {
      return toast.error('Custom modda cron expression girin');
    }

    // İlk gönderim zamanı:
    // - sendNow: hemen
    // - oneoff: kullanıcının seçtiği datetime + opsiyonel rastgele offset
    // - recurring: cron'un bir sonraki firing'i + opsiyonel rastgele offset
    let scheduledISO: string;
    if (sendNow) {
      scheduledISO = new Date(Date.now() - 1000).toISOString();
    } else if (draft.schedule_mode === 'oneoff') {
      const base = new Date(localInputToISO(draft.scheduled_at));
      scheduledISO = applyRandomOffset(base, draft.time_range_minutes).toISOString();
    } else if (cron) {
      const next = nextFirings(cron, new Date(), 1)[0];
      if (!next) {
        return toast.error('Bu cron pattern\'a uyan bir firing bulunamadı (90 gün içinde)');
      }
      scheduledISO = applyRandomOffset(next, draft.time_range_minutes).toISOString();
    } else {
      scheduledISO = localInputToISO(draft.scheduled_at);
    }

    setBusy(true);
    try {
      const cleanButtons = draft.buttons
        .map((row) => row.filter((b) => b.text && b.url))
        .filter((row) => row.length > 0);

      const payload = {
        channel_id: draft.channel_id!,
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
        scheduled_at: scheduledISO,
        recurring: null,
        cron_expression: cron,
        auto_delete_minutes: draft.auto_delete_minutes || null,
        time_range_minutes: draft.time_range_minutes || 0,
        // Seri limitleri sadece tekrarlı modda gönderilir
        max_occurrences: cron && draft.max_occurrences ? Number(draft.max_occurrences) : null,
        recurrence_end: cron && draft.recurrence_end ? localInputToISO(draft.recurrence_end) : null,
      };

      if (editingPost) {
        // EDIT modu: PUT
        await updatePost.mutateAsync({ id: editingPost.id, payload });
        toast.success('Güncellendi ✏️');
        onCancelEdit?.();
      } else {
        const r = await createPost.mutateAsync(payload);
        if (sendNow) {
          await sendNowMutation.mutateAsync(r.id);
          toast.success('Gönderildi! 🚀');
        } else {
          toast.success(
            draft.schedule_mode === 'oneoff' ? 'Zamanlandı 📅' : 'Tekrarlı zamanlandı 🔁',
          );
        }
      }

      setDraft(emptyDraft(draft.channel_id));
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
      <Card className={editingPost ? 'border-amber-500/50' : ''}>
        <CardHeader>
          {editingPost ? (
            <>
              <CardTitle className="flex items-center gap-2">
                ✏️ Düzenleniyor: Post #{editingPost.id}
              </CardTitle>
              <CardDescription className="flex items-center justify-between">
                <span>Değişikliği kaydedince post yeniden zamanlanır.</span>
                <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                  ✕ İptal
                </Button>
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle>Yeni Gönderi</CardTitle>
              <CardDescription>HTML formatlama, emoji ve satır boşlukları aynen Telegram'a aktarılır.</CardDescription>
            </>
          )}
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
              <div className="flex gap-2">
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger><SelectValue placeholder="Şablon seç…" /></SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter(
                        (t) =>
                          t.channel_id == null ||
                          t.channel_id === draft.channel_id,
                      )
                      .map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.channel_id == null ? '🌐 ' : '📡 '}
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={saveAsTemplate}
                  title="Bu gönderiyi şablon olarak kaydet"
                >
                  💾 Şablon yap
                </Button>
              </div>
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
            {(() => {
              const issues = checkTelegramHtml(draft.text);
              if (issues.length === 0) return null;
              const errors = issues.filter((i) => i.type === 'orphan_close');
              const warnings = issues.filter((i) => i.type === 'unclosed_open');
              return (
                <div className="space-y-1 text-xs">
                  {errors.length > 0 && (
                    <div className="rounded-md bg-destructive/10 px-2 py-1.5 text-destructive">
                      ⚠️ <b>HTML hatası:</b> {errors[0].message}
                      {errors.length > 1 && ` (+${errors.length - 1} adet daha)`}
                      <span className="ml-1 opacity-70">— Gönderim öncesi otomatik düzeltilecek.</span>
                    </div>
                  )}
                  {warnings.length > 0 && errors.length === 0 && (
                    <div className="rounded-md bg-amber-500/10 px-2 py-1.5 text-amber-600">
                      ℹ️ {warnings[0].message}
                    </div>
                  )}
                </div>
              );
            })()}
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

          {/* --- ZAMANLAMA --- */}
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <Label className="text-base font-semibold">Zamanlama</Label>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Mod</Label>
              <Select
                value={draft.schedule_mode}
                onValueChange={(v) => update('schedule_mode', v as ScheduleMode)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCHEDULE_MODE_LABELS) as ScheduleMode[]).map((m) => (
                    <SelectItem key={m} value={m}>{SCHEDULE_MODE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mod'a göre dinamik alanlar */}
            {draft.schedule_mode === 'oneoff' && (
              <div className="space-y-2">
                <Label className="text-xs">Tarih & Saat</Label>
                <Input
                  type="datetime-local"
                  value={draft.scheduled_at}
                  onChange={(e) => update('scheduled_at', e.target.value)}
                />
              </div>
            )}

            {draft.schedule_mode === 'interval' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">Sıklık</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">Her</span>
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      value={draft.interval_value}
                      onChange={(e) => update('interval_value', Math.max(1, Number(e.target.value) || 1))}
                      className="w-20"
                    />
                    <Select
                      value={draft.interval_unit}
                      onValueChange={(v) => update('interval_unit', v as IntervalUnit)}
                    >
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minute">dakikada</SelectItem>
                        <SelectItem value="hour">saatte</SelectItem>
                        <SelectItem value="day">günde</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">bir gönder</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[
                      { v: 30, u: 'minute', l: '30dk' },
                      { v: 1, u: 'hour', l: 'Saatlik' },
                      { v: 3, u: 'hour', l: '3 saat' },
                      { v: 6, u: 'hour', l: '6 saat' },
                      { v: 12, u: 'hour', l: '12 saat' },
                      { v: 1, u: 'day', l: 'Günlük' },
                      { v: 2, u: 'day', l: '2 günde 1' },
                      { v: 7, u: 'day', l: 'Haftalık' },
                    ].map((p) => (
                      <Button
                        key={`${p.v}-${p.u}`}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px]"
                        onClick={() => {
                          update('interval_value', p.v);
                          update('interval_unit', p.u as IntervalUnit);
                        }}
                      >
                        {p.l}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Saat picker — unit'e göre değişir */}
                {draft.interval_unit === 'day' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Günün saati</Label>
                    <Input
                      type="time"
                      value={draft.interval_time}
                      onChange={(e) => update('interval_time', e.target.value)}
                      className="max-w-32"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Her {draft.interval_value} günde bir, bu saatte gönderilir.
                    </p>
                  </div>
                )}
                {draft.interval_unit === 'hour' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Saatin dakikası</Label>
                    <Input
                      type="time"
                      value={draft.interval_time}
                      onChange={(e) => update('interval_time', e.target.value)}
                      className="max-w-32"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Sadece dakika kısmı dikkate alınır (örn. 14:30 → her N saatin :30'unda).
                    </p>
                  </div>
                )}
              </div>
            )}

            {draft.schedule_mode === 'weekly' && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Günler</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {WEEKDAY_LABELS.map((d) => {
                      const active = draft.weekdays.includes(d.num);
                      return (
                        <Button
                          key={d.num}
                          type="button"
                          variant={active ? 'default' : 'outline'}
                          size="sm"
                          className="h-9 w-12"
                          onClick={() => {
                            const next = active
                              ? draft.weekdays.filter((x) => x !== d.num)
                              : [...draft.weekdays, d.num];
                            update('weekdays', next);
                          }}
                          title={d.full}
                        >
                          {d.short}
                        </Button>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                      onClick={() => update('weekdays', [1, 2, 3, 4, 5])}>Hafta içi</Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                      onClick={() => update('weekdays', [0, 6])}>Hafta sonu</Button>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                      onClick={() => update('weekdays', [0, 1, 2, 3, 4, 5, 6])}>Her gün</Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Saat</Label>
                  <Input
                    type="time"
                    value={draft.weekly_time}
                    onChange={(e) => update('weekly_time', e.target.value)}
                    className="mt-1.5 max-w-32"
                  />
                </div>
              </div>
            )}

            {draft.schedule_mode === 'monthly' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Ayın günü (1-31)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={draft.monthly_day}
                    onChange={(e) => update('monthly_day', Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Şubat'ta 30/31 yoksa o ay atlanır.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Saat</Label>
                  <Input
                    type="time"
                    value={draft.monthly_time}
                    onChange={(e) => update('monthly_time', e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </div>
            )}

            {draft.schedule_mode === 'custom' && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  <Repeat className="h-3 w-3" /> Cron Expression
                </Label>
                <Input
                  value={draft.cron_expression}
                  onChange={(e) => update('cron_expression', e.target.value)}
                  placeholder="0 12 * * 1-5"
                  className="font-mono"
                />
                <div className="flex flex-wrap gap-1">
                  {[
                    { v: '0 9,18 * * *', l: 'Her gün 09 ve 18' },
                    { v: '*/30 * * * *', l: 'Her 30 dk' },
                    { v: '0 12 * * 1-5', l: 'Hafta içi öğle' },
                    { v: '0 18 * * 5', l: 'Her Cuma 18:00' },
                  ].map((p) => (
                    <Button key={p.v} type="button" variant="outline" size="sm"
                      className="h-6 text-[11px]"
                      onClick={() => update('cron_expression', p.v)}>
                      {p.l}
                    </Button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Format: <code>dakika saat gün ay haftagünü</code> · 0=Pazar, 1-5=Pzt-Cuma
                </p>
              </div>
            )}

            {/* Rastgele dağıtım — her saat picker için ortak */}
            <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
              <Label className="flex items-center gap-1.5 text-xs">
                🎲 Rastgele Dağıt (opsiyonel)
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  value={draft.time_range_minutes || 0}
                  onChange={(e) => update('time_range_minutes', Math.max(0, Number(e.target.value) || 0))}
                  className="max-w-24"
                />
                <span className="text-xs text-muted-foreground">dakika içinde</span>
                {[0, 15, 30, 60, 120, 240].map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={draft.time_range_minutes === m ? 'default' : 'outline'}
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => update('time_range_minutes', m)}
                  >
                    {m === 0 ? 'Yok' : m < 60 ? `±${m}dk` : `±${m / 60}sa`}
                  </Button>
                ))}
              </div>
              {draft.time_range_minutes > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Her gönderim, baz saatten 0–{draft.time_range_minutes} dk sonra <b>rastgele</b> bir saatte yapılır.
                </p>
              )}
            </div>

            {/* Seri limitleri — sadece tekrarlı modlarda */}
            {draft.schedule_mode !== 'oneoff' && (
              <div className="space-y-2 rounded-md border border-dashed p-2.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Repeat className="h-3 w-3" /> Seri Limiti (opsiyonel — boşsa sonsuz)
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Max gönderim sayısı</span>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Sınırsız"
                      value={draft.max_occurrences ?? ''}
                      onChange={(e) =>
                        update('max_occurrences', e.target.value ? Math.max(1, Number(e.target.value)) : null)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Bitiş tarihi</span>
                    <Input
                      type="datetime-local"
                      value={draft.recurrence_end}
                      onChange={(e) => update('recurrence_end', e.target.value)}
                    />
                  </div>
                </div>
                {(draft.max_occurrences || draft.recurrence_end) && (
                  <p className="text-[11px] text-muted-foreground">
                    Seri
                    {draft.max_occurrences ? ` ${draft.max_occurrences} gönderimden sonra` : ''}
                    {draft.max_occurrences && draft.recurrence_end ? ' veya' : ''}
                    {draft.recurrence_end ? ` ${formatDateTime(localInputToISO(draft.recurrence_end))} sonrasında` : ''}{' '}
                    otomatik durur.
                  </p>
                )}
              </div>
            )}

            {/* Sonraki gönderim önizlemesi */}
            <SchedulePreview draft={draft} />
          </div>

          {/* Auto-delete */}
          <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Otomatik Sil (dakika)
            </Label>
            <div className="flex flex-wrap gap-2">
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
              {[15, 60, 360, 1440, null].map((m) => (
                <Button
                  key={String(m)}
                  type="button"
                  variant={draft.auto_delete_minutes === m ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => update('auto_delete_minutes', m)}
                >
                  {m === null ? 'Silme' : m < 60 ? `${m}dk` : m === 1440 ? '1 gün' : `${m / 60}sa`}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Telegram bot mesajlarını sadece <b>48 saat içinde</b> silebilir.
            </p>
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
              {editingPost ? 'Değişikliği Kaydet' : 'Zamanla'}
            </Button>
            {!editingPost && (
              <Button variant="secondary" onClick={() => submit(true)} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Hemen Gönder
              </Button>
            )}
            {editingPost && (
              <Button variant="ghost" onClick={onCancelEdit} disabled={busy}>
                İptal
              </Button>
            )}
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

function SchedulePreview({ draft }: { draft: ComposeDraft }) {
  const cron = buildCron(draft);
  const range = draft.time_range_minutes || 0;

  if (draft.schedule_mode === 'oneoff') {
    if (!draft.scheduled_at) return null;
    const d = new Date(localInputToISO(draft.scheduled_at));
    const diff = d.getTime() - Date.now();
    if (diff < 0) {
      return (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          ⚠️ Seçtiğin tarih geçmişte — kaydedince hemen gönderilir.
        </div>
      );
    }
    if (range > 0) {
      const end = new Date(d.getTime() + range * 60 * 1000);
      return (
        <div className="rounded-md bg-primary/10 px-3 py-2 text-xs">
          📅 <b>Gönderim aralığı:</b> {formatDateTime(d.toISOString())} — {formatDateTime(end.toISOString())}
          <div className="text-[10px] text-muted-foreground">Bu aralık içinde rastgele bir saatte gönderilecek.</div>
        </div>
      );
    }
    return (
      <div className="rounded-md bg-primary/10 px-3 py-2 text-xs">
        📅 <b>Gönderim:</b> {formatDateTime(d.toISOString())}
      </div>
    );
  }

  if (!cron) {
    return (
      <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
        ⚠️ Zamanlama bilgisi eksik.
      </div>
    );
  }

  const nexts = nextFiringsWithRange(cron, range, new Date(), 3);
  if (nexts.length === 0) {
    return (
      <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
        ⚠️ Bu pattern'a uyan firing bulunamadı (90 gün içinde).
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-md bg-primary/10 px-3 py-2 text-xs">
      <div className="flex items-center gap-1 font-medium">
        🔁 <span>Sonraki gönderimler:</span>
        <code className="ml-auto rounded bg-background/50 px-1.5 py-0.5 text-[10px]">{cron}</code>
      </div>
      <ul className="space-y-0.5 pl-4 text-muted-foreground">
        {nexts.map(({ base, rangeEnd }, i) => (
          <li key={i}>
            {i + 1}. {formatDateTime(base.toISOString())}
            {rangeEnd && (
              <span className="opacity-70"> — {formatDateTime(rangeEnd.toISOString())} arası rastgele</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
