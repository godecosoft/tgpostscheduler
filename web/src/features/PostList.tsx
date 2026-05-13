import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, Trash2, Repeat, BellOff, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { Post } from '@/lib/types';

interface Props {
  posts: Post[];
  onChanged: () => void;
  showSendNow?: boolean;
  emptyMessage?: string;
}

function statusBadge(status: Post['status']) {
  if (status === 'sent') return <Badge variant="success">Gönderildi</Badge>;
  if (status === 'failed') return <Badge variant="destructive">Başarısız</Badge>;
  return <Badge variant="warning">Bekliyor</Badge>;
}

export function PostList({ posts, onChanged, showSendNow, emptyMessage }: Props) {
  async function sendNow(id: number) {
    try {
      await api.post(`/api/posts/${id}/send-now`);
      toast.success('Gönderildi');
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(id: number) {
    if (!confirm('Bu gönderiyi silmek istediğine emin misin?')) return;
    try {
      await api.del(`/api/posts/${id}`);
      toast.success('Silindi');
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        {emptyMessage || 'Kayıt yok.'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((p) => {
        let buttonRows: any[][] = [];
        try {
          buttonRows = p.buttons ? JSON.parse(p.buttons) : [];
        } catch {}
        return (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(p.status)}
                    <Badge variant="outline">📺 {p.channel_name}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(p.scheduled_at)}
                    </span>
                    {p.recurring && (
                      <Badge variant="secondary" className="gap-1">
                        <Repeat className="h-3 w-3" /> {p.recurring}
                      </Badge>
                    )}
                    {p.silent ? (
                      <Badge variant="secondary" className="gap-1">
                        <BellOff className="h-3 w-3" /> sessiz
                      </Badge>
                    ) : null}
                  </div>
                  <pre className="max-h-40 overflow-hidden whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs leading-relaxed text-foreground/90">
                    {p.text}
                  </pre>
                  {buttonRows.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {buttonRows.flat().map((b: any, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          🔘 {b.text}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {p.error && (
                    <div className="flex items-start gap-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{p.error}</span>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {showSendNow && p.status !== 'sent' && (
                    <Button size="sm" variant="secondary" onClick={() => sendNow(p.id)}>
                      <Send className="mr-1 h-3.5 w-3.5" />
                      Gönder
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
