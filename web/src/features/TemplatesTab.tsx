import { useState, type FormEvent } from 'react';
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
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Template, Channel } from '@/lib/types';

interface Props {
  templates: Template[];
  channels: Channel[];
  onChanged: () => void;
}

const GENERAL = '__general__';

export function TemplatesTab({ templates, channels, onChanged }: Props) {
  const [form, setForm] = useState({ name: '', text: '' });
  const [channelId, setChannelId] = useState<string>(GENERAL);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/templates', {
        ...form,
        channel_id: channelId === GENERAL ? null : Number(channelId),
      });
      toast.success('Şablon eklendi');
      setForm({ name: '', text: '' });
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm('Şablonu sil?')) return;
    try {
      await api.del(`/api/templates/${id}`);
      toast.success('Silindi');
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  function channelName(id: number | null) {
    if (id == null) return null;
    return channels.find((c) => c.id === id)?.name ?? `#${id}`;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Yeni Şablon</CardTitle>
          <CardDescription>
            iGaming kampanyaları için tekrar kullanılabilir gönderi şablonu kaydet.
            Bir kanal seçersen şablon sadece o kanalda listelenir; "Genel" seçersen tüm kanallarda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="space-y-3">
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
            <Button type="submit" disabled={busy}>
              + Şablon Ekle
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {templates.length === 0 ? (
          <div className="md:col-span-2 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Henüz şablon yok.
          </div>
        ) : (
          templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{t.name}</div>
                    <Badge variant="secondary" className="mt-1 text-[10px] font-normal">
                      {channelName(t.channel_id) ? `📡 ${channelName(t.channel_id)}` : '🌐 Genel'}
                    </Badge>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <pre className="max-h-40 overflow-hidden whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs">
                  {t.text}
                </pre>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
