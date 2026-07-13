import { useRef, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trash2, Pencil, Plus, X, ImageIcon, Loader2, Layers, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  usePools, usePool, useCreatePool, useUpdatePool, useDeletePool,
  useAddPoolItem, useUpdatePoolItem, useDeletePoolItem,
} from '@/hooks/usePools';
import type { PoolItem, Button as BtnType, MediaType, UploadResult } from '@/lib/types';

function parseButtons(raw: string | null): BtnType[] {
  if (!raw) return [];
  try {
    const grid = JSON.parse(raw);
    if (Array.isArray(grid)) return grid.flat().filter((b: any) => b && b.text);
  } catch {}
  return [];
}

interface ItemForm {
  text: string;
  buttons: BtnType[];
  photo_path: string | null;
  photo_url: string | null;
  media_type: MediaType | null;
}
const emptyItem: ItemForm = { text: '', buttons: [], photo_path: null, photo_url: null, media_type: null };

export function PoolsTab() {
  const { data: pools = [] } = usePools();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');

  const createPool = useCreatePool();
  const updatePool = useUpdatePool();
  const deletePool = useDeletePool();

  async function addPool(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const r = await createPool.mutateAsync(newName.trim());
      setNewName('');
      setSelectedId(r.id);
      toast.success('Havuz oluşturuldu');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function renamePool(id: number, current: string) {
    const name = prompt('Havuz adı:', current);
    if (!name || name === current) return;
    try {
      await updatePool.mutateAsync({ id, name });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function removePool(id: number) {
    if (!confirm('Havuzu ve tüm içeriğini sil?')) return;
    try {
      await deletePool.mutateAsync(id);
      if (selectedId === id) setSelectedId(null);
      toast.success('Silindi');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Yeni Havuz</CardTitle>
            <CardDescription>
              Tekrarlı postlar için içerik havuzu. Bir posta bağlanınca her gönderimde
              havuzdan sırayla ya da rastgele içerik atılır.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={addPool} className="flex gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Günün Oyunu"
              />
              <Button type="submit" size="sm" className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {pools.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              Henüz havuz yok.
            </div>
          ) : (
            pools.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={
                  'flex w-full items-center gap-2 rounded-md border p-3 text-left text-sm transition hover:bg-accent ' +
                  (selectedId === p.id ? 'border-primary bg-primary/5' : '')
                }
              >
                <Layers className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <Badge variant="secondary" className="text-[10px]">{p.item_count ?? 0} öğe</Badge>
                <span className="flex gap-0.5">
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-1 hover:bg-muted"
                    onClick={(e) => { e.stopPropagation(); renamePool(p.id, p.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-1 hover:bg-muted"
                    onClick={(e) => { e.stopPropagation(); removePool(p.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        {selectedId ? (
          <PoolItems poolId={selectedId} />
        ) : (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            İçeriğini yönetmek için soldan bir havuz seç.
          </div>
        )}
      </div>
    </div>
  );
}

function PoolItems({ poolId }: { poolId: number }) {
  const { data: pool } = usePool(poolId);
  const addItem = useAddPoolItem();
  const updateItem = useUpdatePoolItem();
  const deleteItem = useDeletePoolItem();

  const [form, setForm] = useState<ItemForm>(emptyItem);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setForm(emptyItem);
    setEditingId(null);
  }

  function startEdit(it: PoolItem) {
    setEditingId(it.id);
    setForm({
      text: it.text || '',
      buttons: parseButtons(it.buttons),
      photo_path: it.photo_path,
      photo_url: it.photo_path ? '/uploads/' + it.photo_path : null,
      media_type: it.media_type,
    });
  }

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

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form.text.trim() && !form.photo_path) return toast.error('Metin veya medya ekleyin');
    setBusy(true);
    const cleanButtons = form.buttons.filter((b) => b.text && b.url).map((b) => [b]);
    const input = {
      text: form.text,
      photo_path: form.photo_path,
      media_type: form.media_type,
      buttons: cleanButtons.length ? cleanButtons : null,
    };
    try {
      if (editingId) {
        await updateItem.mutateAsync({ poolId, itemId: editingId, input });
        toast.success('Öğe güncellendi');
      } else {
        await addItem.mutateAsync({ poolId, input });
        toast.success('Öğe eklendi');
      }
      reset();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(itemId: number) {
    if (!confirm('Öğeyi sil?')) return;
    try {
      await deleteItem.mutateAsync({ poolId, itemId });
      if (editingId === itemId) reset();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function setButton(i: number, patch: Partial<BtnType>) {
    setForm((f) => ({ ...f, buttons: f.buttons.map((b, idx) => (idx === i ? { ...b, ...patch } : b)) }));
  }

  const items = pool?.items || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? 'Öğeyi Düzenle' : `"${pool?.name || ''}" havuzuna öğe ekle`}
          </CardTitle>
          <CardDescription>Her öğe bir gönderi içeriğidir: metin + opsiyonel medya + butonlar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-3">
            <Textarea
              rows={4}
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="⚽ Günün Oyunu: ..."
              className="font-mono text-sm"
            />

            {/* Medya */}
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
                  type="button" variant="ghost" size="sm" className="ml-auto"
                  onClick={() => setForm((f) => ({ ...f, photo_path: null, photo_url: null, media_type: null }))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="mr-1 h-3.5 w-3.5" />}
                Medya Yükle
              </Button>
            )}

            {/* Butonlar */}
            <div className="space-y-2">
              <Label className="text-xs">Butonlar (opsiyonel)</Label>
              {form.buttons.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="Buton yazısı" value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} />
                  <Input placeholder="https://…" value={b.url} onChange={(e) => setButton(i, { url: e.target.value })} />
                  <Button type="button" variant="ghost" size="sm"
                    onClick={() => setForm((f) => ({ ...f, buttons: f.buttons.filter((_, idx) => idx !== i) }))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm"
                onClick={() => setForm((f) => ({ ...f, buttons: [...f.buttons, { text: '', url: '' }] }))}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Buton Ekle
              </Button>
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>{editingId ? 'Kaydet' : '+ Öğe Ekle'}</Button>
              {editingId && <Button type="button" variant="outline" onClick={reset}>Vazgeç</Button>}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Bu havuzda henüz öğe yok.
          </div>
        ) : (
          items.map((it, idx) => {
            const btns = parseButtons(it.buttons);
            return (
              <Card key={it.id}>
                <CardContent className="flex items-start gap-3 p-3">
                  <Badge variant="secondary" className="mt-0.5 text-[10px]">#{idx + 1}</Badge>
                  {it.photo_path && (
                    <img src={'/uploads/' + it.photo_path} alt="" className="h-12 w-12 rounded object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <pre className="max-h-20 overflow-hidden whitespace-pre-wrap text-xs text-foreground/90">
                      {it.text || '(medya)'}
                    </pre>
                    {btns.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {btns.map((b, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">🔘 {b.text}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(it)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(it.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
