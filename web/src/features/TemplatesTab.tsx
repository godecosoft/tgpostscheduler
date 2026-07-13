import { useRef, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Pencil, Plus, X, ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '@/hooks/useTemplates';
import type { Template, Channel, Button as BtnType, MediaType, UploadResult } from '@/lib/types';

interface Props {
  templates: Template[];
  channels: Channel[];
}

const GENERAL = '__general__';

interface FormState {
  name: string;
  text: string;
  buttons: BtnType[];
  photo_path: string | null;
  photo_url: string | null;
  media_type: MediaType | null;
}

const emptyForm: FormState = { name: '', text: '', buttons: [], photo_path: null, photo_url: null, media_type: null };

// Şablonun buttons string'ini düz Button listesine indir (grid → flat)
function parseButtons(raw: string | null): BtnType[] {
  if (!raw) return [];
  try {
    const grid = JSON.parse(raw);
    if (Array.isArray(grid)) return grid.flat().filter((b: any) => b && b.text);
  } catch {}
  return [];
}

export function TemplatesTab({ templates, channels }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [channelId, setChannelId] = useState<string>(GENERAL);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const createM = useCreateTemplate();
  const updateM = useUpdateTemplate();
  const deleteM = useDeleteTemplate();

  async function uploadMedia(file: File) {
    setUploading(true);
    try {
      const r = await api.upload<UploadResult>('/api/posts/upload', file);
      setForm((f) => ({ ...f, photo_path: r.path, photo_url: r.url, media_type: r.media_type }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setChannelId(GENERAL);
    setEditingId(null);
  }

  function startEdit(t: Template) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      text: t.text,
      buttons: parseButtons(t.buttons),
      photo_path: t.photo_path,
      photo_url: t.photo_path ? '/uploads/' + t.photo_path : null,
      media_type: t.media_type,
    });
    setChannelId(t.channel_id == null ? GENERAL : String(t.channel_id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Butonları grid'e çevir: her buton kendi satırında (dikey)
    const cleanButtons = form.buttons.filter((b) => b.text && b.url).map((b) => [b]);
    const payload = {
      name: form.name,
      text: form.text,
      channel_id: channelId === GENERAL ? null : Number(channelId),
      buttons: cleanButtons.length ? cleanButtons : null,
      photo_path: form.photo_path,
      media_type: form.media_type,
    };
    try {
      if (editingId) {
        await updateM.mutateAsync({ id: editingId, ...payload });
        toast.success('Şablon güncellendi');
      } else {
        await createM.mutateAsync(payload);
        toast.success('Şablon eklendi');
      }
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Şablonu sil?')) return;
    try {
      await deleteM.mutateAsync(id);
      toast.success('Silindi');
      if (editingId === id) resetForm();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function channelName(id: number | null) {
    if (id == null) return null;
    return channels.find((c) => c.id === id)?.name ?? `#${id}`;
  }

  function setButton(i: number, patch: Partial<BtnType>) {
    setForm((f) => ({
      ...f,
      buttons: f.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Şablonu Düzenle' : 'Yeni Şablon'}</CardTitle>
          <CardDescription>
            iGaming kampanyaları için tekrar kullanılabilir gönderi şablonu kaydet.
            Bir kanal seçersen şablon sadece o kanalda listelenir; "Genel" seçersen tüm kanallarda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>İsim *</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="🎰 Hoşgeldin Bonusu"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Kanal</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GENERAL}>🌐 Genel (tüm kanallar)</SelectItem>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} {c.username && `(@${c.username})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Metin *</Label>
              <Textarea
                required
                rows={6}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder="🎰 HOŞGELDİN BONUSU 🎰..."
                className="font-mono text-sm"
              />
            </div>

            {/* Medya (opsiyonel) */}
            <div className="space-y-2">
              <Label>Medya (opsiyonel)</Label>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,.gif,.mp4,.mov,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMedia(f);
                  e.target.value = '';
                }}
              />
              {form.photo_url ? (
                <div className="flex items-center gap-3 rounded-md border p-2">
                  {form.media_type === 'photo' || form.media_type === 'animation' ? (
                    <img src={form.photo_url} alt="" className="h-14 w-14 rounded object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded bg-muted">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">{form.media_type}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setForm((f) => ({ ...f, photo_path: null, photo_url: null, media_type: null }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="mr-1 h-3.5 w-3.5" />
                  )}
                  Medya Yükle
                </Button>
              )}
            </div>

            {/* Butonlar */}
            <div className="space-y-2">
              <Label>Butonlar (opsiyonel)</Label>
              {form.buttons.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="Buton yazısı"
                    value={b.text}
                    onChange={(e) => setButton(i, { text: e.target.value })}
                  />
                  <Input
                    placeholder="https://…"
                    value={b.url}
                    onChange={(e) => setButton(i, { url: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setForm((f) => ({ ...f, buttons: f.buttons.filter((_, idx) => idx !== i) }))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((f) => ({ ...f, buttons: [...f.buttons, { text: '', url: '' }] }))}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Buton Ekle
              </Button>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {editingId ? 'Kaydet' : '+ Şablon Ekle'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Vazgeç
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {templates.length === 0 ? (
          <div className="md:col-span-2 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Henüz şablon yok.
          </div>
        ) : (
          templates.map((t) => {
            const btns = parseButtons(t.buttons);
            return (
              <Card key={t.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{t.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {channelName(t.channel_id) ? `📡 ${channelName(t.channel_id)}` : '🌐 Genel'}
                        </Badge>
                        {t.photo_path && (
                          <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                            <ImageIcon className="h-3 w-3" /> {t.media_type || 'medya'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <pre className="max-h-40 overflow-hidden whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">
                    {t.text}
                  </pre>
                  {btns.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {btns.map((b, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          🔘 {b.text}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
