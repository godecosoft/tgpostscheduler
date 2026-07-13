import { useEffect, useRef, useState } from 'react';
import { Send, CalendarClock, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import type {
  Channel, Template, ButtonGrid, ComposeDraft, MediaType, MediaGroupItem, Post,
} from '@/lib/types';
import { localInputToISO, toLocalInputValue, checkTelegramHtml } from '@/lib/utils';
import {
  buildCron, nextFirings, applyRandomOffset, parseCronToSchedule,
} from '@/lib/schedule';
import { useCreatePost, useUpdatePost, useSendNow } from '@/hooks/usePosts';
import { useCreateTemplate } from '@/hooks/useTemplates';
import { usePools } from '@/hooks/usePools';
import { ButtonBuilder } from './compose/ButtonBuilder';
import { MediaUploader } from './compose/MediaUploader';
import { RichTextToolbar } from './compose/RichTextToolbar';
import { SchedulePicker } from './compose/SchedulePicker';
import { TelegramPreview } from './TelegramPreview';

interface Props {
  channels: Channel[];
  templates: Template[];
  editingPost?: Post | null;
  presetDate?: string | null; // takvimden gelen ISO tarih — scheduled_at'e uygulanır
  onCancelEdit?: () => void;
}

const emptyDraft = (channelId: number | null): ComposeDraft => ({
  channel_id: channelId,
  crossChannels: [],
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
  pool_id: null,
  pool_rotation: 'sequential',
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
    crossChannels: [],
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
    pool_id: p.pool_id ?? null,
    pool_rotation: p.pool_rotation ?? 'sequential',
    auto_delete_minutes: p.auto_delete_minutes,
    silent: !!p.silent,
    disable_preview: !!p.disable_preview,
  };
}

const DRAFT_KEY = 'ars-compose-draft';

export function ComposeTab({ channels, templates, editingPost, presetDate, onCancelEdit }: Props) {
  // Taslak otomatik kayıt: localStorage'dan geri yükle (create modunda)
  const [draft, setDraft] = useState<ComposeDraft>(() => {
    if (!editingPost) {
      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) return { ...emptyDraft(channels[0]?.id ?? null), ...JSON.parse(saved) };
      } catch {}
    }
    return emptyDraft(channels[0]?.id ?? null);
  });
  const [busy, setBusy] = useState(false);
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const sendNowMutation = useSendNow();
  const createTemplate = useCreateTemplate();
  const { data: pools = [] } = usePools();
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

  // Takvimden gelen tarih: create modunda scheduled_at'i ayarla (tek seferlik)
  useEffect(() => {
    if (presetDate && !editingPost) {
      setDraft((d) => ({
        ...d,
        schedule_mode: 'oneoff',
        scheduled_at: toLocalInputValue(new Date(presetDate)),
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [presetDate, editingPost]);

  // Taslak otomatik kayıt — create modunda her değişiklikte sakla
  useEffect(() => {
    if (editingPost) return; // düzenlerken taslak kaydetme
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft, editingPost]);

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

  function applyTemplate(id: string) {
    const t = templates.find((t) => String(t.id) === id);
    if (!t) return;
    setDraft((d) => {
      const next = { ...d, text: t.text };
      if (t.buttons) {
        try { next.buttons = JSON.parse(t.buttons); } catch {}
      }
      // Şablon medyası varsa uygula (tekli medya)
      if (t.photo_path) {
        next.photo_path = t.photo_path;
        next.photo_url = '/uploads/' + t.photo_path;
        next.media_type = (t.media_type as MediaType) || 'photo';
        next.media_group = [];
      }
      return next;
    });
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
        // Tekli medya varsa şablona da kaydet (media_group hariç)
        photo_path: draft.media_group.length === 0 ? draft.photo_path : null,
        media_type: draft.media_group.length === 0 && draft.photo_path ? draft.media_type : null,
      });
      toast.success('Şablon kaydedildi');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function submit(sendNow: boolean) {
    if (!draft.channel_id) return toast.error('Kanal seçin');
    // Cron expression hesapla (oneoff dışında)
    const cron = buildCron(draft);
    const usePool = !!cron && !!draft.pool_id; // havuz yalnızca tekrarlı modda anlamlı

    const hasMedia = !!draft.photo_url || draft.media_group.length > 0;
    if (!usePool && !draft.text.trim() && !hasMedia) return toast.error('Metin veya görsel ekleyin');

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
        // İçerik havuzu (yalnızca tekrarlı modda)
        pool_id: usePool ? draft.pool_id : null,
        pool_rotation: usePool ? draft.pool_rotation : null,
      };

      if (editingPost) {
        // EDIT modu: PUT
        await updatePost.mutateAsync({ id: editingPost.id, payload });
        toast.success('Güncellendi ✏️');
        onCancelEdit?.();
      } else {
        // Cross-post: birincil + ek kanallar (tekilleştir)
        const targets = Array.from(new Set([draft.channel_id!, ...draft.crossChannels]));
        for (const cid of targets) {
          const r = await createPost.mutateAsync({ ...payload, channel_id: cid });
          if (sendNow) await sendNowMutation.mutateAsync(r.id);
        }
        if (targets.length > 1) {
          toast.success(`${targets.length} kanala ${sendNow ? 'gönderildi 🚀' : 'zamanlandı 📅'}`);
        } else if (sendNow) {
          toast.success('Gönderildi! 🚀');
        } else {
          toast.success(
            draft.schedule_mode === 'oneoff' ? 'Zamanlandı 📅' : 'Tekrarlı zamanlandı 🔁',
          );
        }
      }

      setDraft(emptyDraft(draft.channel_id));
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

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

          {/* Cross-post: aynı gönderiyi ek kanallara (yalnızca yeni gönderide) */}
          {!editingPost && channels.length > 1 && (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <Label className="text-xs">Ek kanallara da gönder (cross-post)</Label>
              <div className="flex flex-wrap gap-1.5">
                {channels
                  .filter((c) => c.id !== draft.channel_id)
                  .map((c) => {
                    const on = draft.crossChannels.includes(c.id);
                    return (
                      <Button
                        key={c.id}
                        type="button"
                        size="sm"
                        variant={on ? 'default' : 'outline'}
                        className="h-7 text-[11px]"
                        onClick={() =>
                          update(
                            'crossChannels',
                            on
                              ? draft.crossChannels.filter((id) => id !== c.id)
                              : [...draft.crossChannels, c.id],
                          )
                        }
                      >
                        {on ? '✓ ' : '+ '}
                        {c.name}
                      </Button>
                    );
                  })}
              </div>
              {draft.crossChannels.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Toplam <b>{draft.crossChannels.length + 1}</b> kanala gönderilecek.
                </p>
              )}
            </div>
          )}

          <MediaUploader draft={draft} update={update} />

          <div className="space-y-2">
            <Label>Mesaj Metni / Caption</Label>
            <RichTextToolbar
              onWrap={wrap}
              onLink={insertLink}
              onPremiumEmoji={insertPremiumEmoji}
              onEmoji={insertEmoji}
            />
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

          <ButtonBuilder value={draft.buttons} onChange={(v) => update('buttons', v)} />

          <SchedulePicker draft={draft} update={update} pools={pools} />

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

