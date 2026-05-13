import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, Code, EyeOff, Link as LinkIcon, ImageIcon, Plus, Trash2, Send, CalendarClock, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Channel, Template, ButtonGrid, ComposeDraft } from '@/lib/types';
import { localInputToISO, toLocalInputValue } from '@/lib/utils';
import { TelegramPreview } from './TelegramPreview';

const QUICK_EMOJIS = ['🎰', '🎁', '💰', '⚽', '🔥', '✅', '🚀', '💎', '🏆', '🎯', '⚡', '🎊'];

interface Props {
  channels: Channel[];
  templates: Template[];
  onSaved: () => void;
}

export function ComposeTab({ channels, templates, onSaved }: Props) {
  const [draft, setDraft] = useState<ComposeDraft>({
    channel_id: channels[0]?.id ?? null,
    text: '',
    photo_path: null,
    photo_url: null,
    buttons: [],
    scheduled_at: toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000)),
    recurring: '',
    silent: false,
    disable_preview: false,
  });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
      'Premium (Custom) Emoji ID:\n\nID öğrenmek için: bot\'a custom emoji içeren bir mesaj yaz/ilet, sana ID listesini versin.',
    );
    if (!id || !/^\d+$/.test(id.trim())) {
      if (id) alert('Geçersiz ID — sadece rakam olmalı');
      return;
    }
    const fallback = prompt('Fallback emoji (Premium olmayan kullanıcıların göreceği):', '✨') || '✨';
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

  async function handleUpload(file: File) {
    try {
      const r = await api.upload<{ path: string; url: string }>('/api/posts/upload', file);
      update('photo_path', r.path);
      update('photo_url', r.url);
      toast.success('Görsel yüklendi');
    } catch (e: any) {
      toast.error(e.message);
    }
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
    const next = draft.buttons.map((row, ri) =>
      ri === rowIdx ? [...row, { text: '', url: '' }] : row,
    );
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
    if (!draft.text.trim() && !draft.photo_url) return toast.error('Metin veya görsel ekleyin');

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
        buttons: cleanButtons.length ? cleanButtons : null,
        parse_mode: 'HTML',
        disable_preview: draft.disable_preview,
        silent: draft.silent,
        scheduled_at: scheduled,
        recurring: draft.recurring || null,
      });

      if (sendNow) {
        await api.post(`/api/posts/${r.id}/send-now`);
        toast.success('Gönderildi! 🚀');
      } else {
        toast.success('Zamanlandı 📅');
      }

      // Reset form
      setDraft({
        channel_id: draft.channel_id,
        text: '',
        photo_path: null,
        photo_url: null,
        buttons: [],
        scheduled_at: toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000)),
        recurring: '',
        silent: false,
        disable_preview: false,
      });
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
                <SelectTrigger>
                  <SelectValue placeholder="Kanal seç" />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="Şablon seç…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Görsel (opsiyonel)</Label>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                <ImageIcon className="mr-2 h-4 w-4" />
                {draft.photo_url ? 'Görseli değiştir' : 'Görsel seç'}
              </Button>
              {draft.photo_url && (
                <>
                  <span className="text-sm text-muted-foreground">Yüklendi</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      update('photo_path', null);
                      update('photo_url', null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mesaj Metni</Label>
            <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1">
              {formatBtns.map(({ tag, icon: Icon, title }) => (
                <Button
                  key={tag}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  title={title}
                  onClick={() => wrap(tag)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                title="Link"
                onClick={insertLink}
              >
                <LinkIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-purple-400"
                title="Premium (custom) Emoji ekle"
                onClick={insertPremiumEmoji}
              >
                <Sparkles className="h-3.5 w-3.5" />
              </Button>
              <Separator orientation="vertical" className="mx-1 h-5" />
              {QUICK_EMOJIS.map((e) => (
                <Button
                  key={e}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-base"
                  onClick={() => insertEmoji(e)}
                >
                  {e}
                </Button>
              ))}
            </div>
            <Textarea
              ref={textRef}
              value={draft.text}
              onChange={(e) => update('text', e.target.value)}
              rows={12}
              spellCheck={false}
              className="font-mono text-sm leading-relaxed"
              placeholder={`🎰 HOŞGELDİN BONUSU 🎰\n\n💰 İlk yatırımına %200 bonus\n🎁 50 Free Spin hediye\n\n⚡ Hemen kayıt ol!`}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Inline Butonlar</Label>
              <Button type="button" variant="outline" size="sm" onClick={addButton}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Satır Ekle
              </Button>
            </div>
            <div className="space-y-2">
              {draft.buttons.map((row, ri) => (
                <div key={ri} className="rounded-md border bg-muted/30 p-2">
                  {row.map((btn, bi) => (
                    <div key={bi} className="mb-1 flex gap-2 last:mb-0">
                      <Input
                        placeholder="Buton metni (örn. Hemen Oyna)"
                        value={btn.text}
                        onChange={(e) => updateButton(ri, bi, 'text', e.target.value)}
                      />
                      <Input
                        placeholder="https://example.com"
                        value={btn.url}
                        onChange={(e) => updateButton(ri, bi, 'url', e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeButton(ri, bi)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 text-xs"
                    onClick={() => addButtonToRow(ri)}
                  >
                    + Aynı satıra buton
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tarih & Saat</Label>
              <Input
                type="datetime-local"
                value={draft.scheduled_at}
                onChange={(e) => update('scheduled_at', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tekrar</Label>
              <Select
                value={draft.recurring || 'none'}
                onValueChange={(v) =>
                  update('recurring', (v === 'none' ? '' : v) as ComposeDraft['recurring'])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tek seferlik" />
                </SelectTrigger>
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

          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={draft.silent}
                onCheckedChange={(v) => update('silent', !!v)}
              />
              Sessiz gönder
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={draft.disable_preview}
                onCheckedChange={(v) => update('disable_preview', !!v)}
              />
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
            photoUrl={draft.photo_url}
            buttons={draft.buttons}
            scheduledAt={draft.scheduled_at ? localInputToISO(draft.scheduled_at) : undefined}
            silent={draft.silent}
          />
        </CardContent>
      </Card>
    </div>
  );
}
