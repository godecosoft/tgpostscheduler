import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Channel } from '@/lib/types';
import { Trash2, Send, Info } from 'lucide-react';

interface Props {
  channels: Channel[];
  onChanged: () => void;
}

export function ChannelsTab({ channels, onChanged }: Props) {
  const [form, setForm] = useState({ name: '', chat_id: '', username: '', note: '' });
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/channels', form);
      toast.success('Kanal eklendi');
      setForm({ name: '', chat_id: '', username: '', note: '' });
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
          <CardTitle>Yeni Kanal</CardTitle>
          <CardDescription>Telegram kanalını sisteme tanıt.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
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
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                + Kanal Ekle
              </Button>
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
              <CardContent className="flex items-center justify-between p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.username && <Badge variant="outline">@{c.username}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Chat ID: <code className="rounded bg-muted px-1">{c.chat_id}</code>
                  </div>
                  {c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => test(c.id)}>
                    <Send className="mr-1 h-3.5 w-3.5" />
                    Test
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
