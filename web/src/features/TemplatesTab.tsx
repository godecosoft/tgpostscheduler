import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Template } from '@/lib/types';

interface Props {
  templates: Template[];
  onChanged: () => void;
}

export function TemplatesTab({ templates, onChanged }: Props) {
  const [form, setForm] = useState({ name: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/templates', form);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Yeni Şablon</CardTitle>
          <CardDescription>
            iGaming kampanyaları için tekrar kullanılabilir gönderi şablonu kaydet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="space-y-3">
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
                  <div className="font-medium">{t.name}</div>
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
