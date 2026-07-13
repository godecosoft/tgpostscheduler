import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useAudit } from '@/hooks/useSystem';
import { formatDateTime } from '@/lib/utils';

const ACTION_LABELS: Record<string, string> = {
  'post.create': '📝 Post oluşturuldu',
  'post.update': '✏️ Post düzenlendi',
  'post.delete': '🗑️ Post silindi',
  'post.send': '📤 Post gönderildi',
  'post.send_fail': '🔴 Gönderim başarısız',
  'post.pause': '⏸️ Seri duraklatıldı',
  'post.resume': '▶️ Seri devam etti',
  'channel.create': '➕ Kanal eklendi',
  'channel.update': '✏️ Kanal düzenlendi',
  'channel.delete': '🗑️ Kanal silindi',
  'template.create': '➕ Şablon eklendi',
  'template.update': '✏️ Şablon düzenlendi',
  'template.delete': '🗑️ Şablon silindi',
  'auth.login': '🔑 Giriş yapıldı',
  'auth.password_change': '🔐 Parola değişti',
};

function actionLabel(a: string) {
  return ACTION_LABELS[a] || a;
}

const FILTERS = [
  { key: 'all', label: 'Tümü' },
  { key: 'post', label: 'Postlar' },
  { key: 'channel', label: 'Kanallar' },
  { key: 'template', label: 'Şablonlar' },
  { key: 'auth', label: 'Oturum' },
] as const;

export function AuditTab() {
  const { data: entries = [], isLoading } = useAudit();
  const [filter, setFilter] = useState<string>('all');

  const shown = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.entity === filter)),
    [entries, filter],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'default' : 'outline'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          Kayıt yok.
        </div>
      ) : (
        <Card>
          <CardContent className="divide-y p-0">
            {shown.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="font-medium">{actionLabel(e.action)}</span>
                <Badge variant={e.actor === 'system' ? 'secondary' : 'outline'} className="text-[10px]">
                  {e.actor === 'system' ? '🤖 sistem' : `👤 ${e.actor}`}
                </Badge>
                {e.entity_id && (
                  <span className="text-xs text-muted-foreground">
                    #{e.entity_id}
                  </span>
                )}
                {e.detail && <span className="text-xs text-muted-foreground">· {e.detail}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(e.at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
