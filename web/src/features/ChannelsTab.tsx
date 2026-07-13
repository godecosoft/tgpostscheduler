import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Channel } from '@/lib/types';
import { Trash2, Send, Info, Pencil, HeartPulse, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface Props {
  channels: Channel[];
  onChanged: () => void;
}

interface Health {
  ok: boolean;
  status?: string;
  is_admin?: boolean;
  can_post?: boolean;
  can_delete?: boolean;
  error?: string;
}

const emptyForm = { name: '', chat_id: '', username: '', note: '' };

export function ChannelsTab({ channels, onChanged }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Record<number, Health | 'loading'>>({});

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(c: Channel) {
    setEditingId(c.id);
    setForm({ name: c.name, chat_id: c.chat_id, username: c.username || '', note: c.note || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editingId) {
        await api.put(`/api/channels/${editingId}`, form);
        toast.success('Kanal güncellendi');
      } else {
        await api.post('/api/channels', form);
        toast.success('Kanal eklendi');
      }
      resetForm();
      onChanged();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Bu kanalı silmek istediğine emin misin? Bağlı tüm gönderiler silinir.')) return;
    try {
      await api.del(`/api/channels/${id}`);
      toast.success('Silindi');
      if (editingId === id) resetForm();
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function test(id: number) {
    try {
      await api.post(`/api/channels/${id}/test`);
      toast.success('Test mesajı gönderildi ✅');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function checkHealth(id: number) {
    setHealth((h) => ({ ...h, [id]: 'loading' }));
    try {
      const res = await api.get<Health>(`/api/channels/${id}/health`);
      setHealth((h) => ({ ...h, [id]: res }));
    } catch (e: any) {
      setHealth((h) => ({ ...h, [id]: { ok: false, error: e.message } }));
    }
  }

  function HealthBadge({ h }: { h: Health | 'loading' }) {
    if (h === 'loading') {
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> kontrol…
        </Badge>
      );
    }
    if (!h.ok) {
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" /> {h.error || 'ulaşılamadı'}
        </Badge>
      );
    }
    if (h.can_post) {
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" /> admin · gönderebilir
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> {h.is_admin ? 'admin ama gönderemez' : `yetki yok (${h.status})`}
      </Badge>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-5 w-5 text-blue-500" />
          <div className="text-sm">
            <strong>Nasıl eklerim?</strong>
            <ol className="mt-1 list-inside list-decimal space-y-0.5 text-muted-foreground">
              <li>Botu kanalına yönetici olarak ekle (mesaj gönderme yetkili).</li>
              <li>Kanaldaki bota <code className="rounded bg-muted px-1">/id</code> yaz.</li>
              <li>Bot sana <code className="rounded bg-muted px-1">-100…</code> ile başlayan chat ID yazar.</li>
              <li>Bu ID'yi aşağıya gir. (Kanalı bot'a eklediğinde otomatik kayıt da olabilir.)</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Kanalı Düzenle' : 'Yeni Kanal'}</CardTitle>
          <CardDescription>Telegram kanalını sisteme tanıt.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>İsim *</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ARS Casino TR"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chat ID *</Label>
              <Input
                required
                value={form.chat_id}
                onChange={(e) => setForm({ ...form, chat_id: e.target.value })}
                placeholder="-1001234567890"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kullanıcı adı</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="arscasinotr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Not</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Türkiye ana kanalı"
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {editingId ? 'Kaydet' : '+ Kanal Ekle'}
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

      <div className="space-y-3">
        {channels.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Henüz kanal eklenmemiş.
          </div>
        ) : (
          channels.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.username && <Badge variant="outline">@{c.username}</Badge>}
                    {health[c.id] && <HealthBadge h={health[c.id]} />}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Chat ID: <code className="rounded bg-muted px-1">{c.chat_id}</code>
                  </div>
                  {c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => checkHealth(c.id)}>
                    <HeartPulse className="mr-1 h-3.5 w-3.5" />
                    Sağlık
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => test(c.id)}>
                    <Send className="mr-1 h-3.5 w-3.5" />
                    Test
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => startEdit(c)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Düzenle
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
