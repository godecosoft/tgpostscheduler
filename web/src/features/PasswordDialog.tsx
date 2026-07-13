import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { useChangePassword } from '@/hooks/useAuth';

interface Props {
  onClose: () => void;
}

export function PasswordDialog({ onClose }: Props) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const changePassword = useChangePassword();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.new_password !== form.confirm) return toast.error('Yeni parolalar eşleşmiyor');
    if (form.new_password.length < 8) return toast.error('Yeni parola en az 8 karakter olmalı');
    setBusy(true);
    try {
      await changePassword.mutateAsync({
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast.success('Parola değiştirildi');
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Parola Değiştir</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Mevcut parola</Label>
            <Input
              type="password"
              required
              value={form.current_password}
              onChange={(e) => setForm({ ...form, current_password: e.target.value })}
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Yeni parola (min 8 karakter)</Label>
            <Input
              type="password"
              required
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Yeni parola (tekrar)</Label>
            <Input
              type="password"
              required
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              autoComplete="new-password"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy}>
              Kaydet
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
