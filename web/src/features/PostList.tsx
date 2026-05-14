import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Send, Trash2, Repeat, BellOff, AlertTriangle, Eye, Heart, Clock, Layers, Film, Image as ImageIcon, FileText, Sparkles, RefreshCw } from 'lucide-react';
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
  if (status === 'deleted') return <Badge variant="secondary">Silindi</Badge>;
  return <Badge variant="warning">Bekliyor</Badge>;
}

function mediaIcon(type: string | null | undefined) {
  if (!type || type === 'text') return null;
  const map: Record<string, any> = {
    photo: ImageIcon,
    video: Film,
    animation: Sparkles,
    sticker: Sparkles,
    document: FileText,
    media_group: Layers,
  };
  const Icon = map[type] || ImageIcon;
  return (
    <Badge variant="secondary" className="gap-1">
      <Icon className="h-3 w-3" />
      {type}
    </Badge>
  );
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
        const reactions: Record<string, number> = (() => {
          try { return p.reactions ? JSON.parse(p.reactions) : {}; } catch { return {}; }
        })();
        const reactionsTotal = Object.values(reactions).reduce((a, b) => a + b, 0);

        return (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(p.status)}
                    <Badge variant="outline">📺 {p.channel_name}</Badge>
                    {mediaIcon(p.media_type)}
                    <span className="text-xs text-muted-foreground">{formatDateTime(p.scheduled_at)}</span>
                    {p.cron_expression ? (
                      <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                        <RefreshCw className="h-3 w-3" /> {p.cron_expression}
                      </Badge>
                    ) : p.recurring ? (
                      <Badge variant="secondary" className="gap-1">
                        <Repeat className="h-3 w-3" /> {p.recurring}
                      </Badge>
                    ) : null}
                    {p.silent ? (
                      <Badge variant="secondary" className="gap-1">
                        <BellOff className="h-3 w-3" /> sessiz
                      </Badge>
                    ) : null}
                    {p.delete_at && p.status === 'sent' && (
                      <Badge variant="destructive" className="gap-1">
                        <Clock className="h-3 w-3" /> Silinecek: {formatDateTime(p.delete_at)}
                      </Badge>
                    )}
                    {p.auto_delete_minutes && p.status !== 'sent' && (
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" /> {p.auto_delete_minutes}dk sonra silinecek
                      </Badge>
                    )}
                  </div>

                  {p.text && (
                    <pre className="max-h-32 overflow-hidden whitespace-pre-wrap rounded bg-muted/40 p-3 text-xs leading-relaxed text-foreground/90">
                      {p.text}
                    </pre>
                  )}

                  {buttonRows.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {buttonRows.flat().map((b: any, i) => (
                        <Badge key={i} variant="outline" className="text-xs">🔘 {b.text}</Badge>
                      ))}
                    </div>
                  )}

                  {/* Stats — sadece gönderilmiş postlar için */}
                  {p.status === 'sent' && (
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3 text-blue-400" />
                        {(p.views || 0).toLocaleString('tr-TR')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="h-3 w-3 text-rose-400" />
                        {reactionsTotal}
                      </span>
                      {Object.entries(reactions).slice(0, 6).map(([k, v]) => (
                        <span key={k}>{k} {v}</span>
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
                      <Send className="mr-1 h-3.5 w-3.5" /> Gönder
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
