import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Send, Trash2, Repeat, BellOff, AlertTriangle, Eye, Heart, Clock, Layers, Film, Image as ImageIcon, FileText, Sparkles, RefreshCw, RotateCcw, Pencil, Shuffle, Pause, Play, Hash, CalendarX, Search, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/utils';
import type { Post, Channel } from '@/lib/types';
import {
  useSendNow, useRetryPost, useDeletePost, usePausePost, useResumePost,
} from '@/hooks/usePosts';
import { PostTrendChart } from './PostTrendChart';

interface Props {
  posts: Post[];
  onEdit?: (post: Post) => void;
  showSendNow?: boolean;
  emptyMessage?: string;
  // Arama + kanal filtresi + sayfalama (Zamanlanmış/Geçmiş için)
  filterable?: boolean;
  channels?: Channel[];
  pageSize?: number;
}

const ALL_CHANNELS = '__all__';

function statusBadge(status: Post['status']) {
  if (status === 'sent') return <Badge variant="success">Gönderildi</Badge>;
  if (status === 'failed') return <Badge variant="destructive">Başarısız</Badge>;
  if (status === 'deleted') return <Badge variant="secondary">Silindi</Badge>;
  if (status === 'paused') return <Badge variant="secondary">⏸ Duraklatıldı</Badge>;
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

export function PostList({ posts, onEdit, showSendNow, emptyMessage, filterable, channels = [], pageSize = 25 }: Props) {
  const sendNowM = useSendNow();
  const retryM = useRetryPost();
  const deleteM = useDeletePost();
  const pauseM = usePausePost();
  const resumeM = useResumePost();

  const [search, setSearch] = useState('');
  const [channelId, setChannelId] = useState<string>(ALL_CHANNELS);
  const [visible, setVisible] = useState(pageSize);
  const [trendOpen, setTrendOpen] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!filterable) return posts;
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (channelId !== ALL_CHANNELS && String(p.channel_id) !== channelId) return false;
      if (q && !(p.text || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [posts, filterable, search, channelId]);

  const shown = filterable ? filtered.slice(0, visible) : filtered;

  async function sendNow(id: number) {
    try {
      await sendNowM.mutateAsync(id);
      toast.success('Gönderildi');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function retry(id: number) {
    try {
      await retryM.mutateAsync(id);
      toast.success('Tekrar denemeye alındı (1 dk içinde gönderilir)');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(id: number) {
    if (!confirm('Bu gönderiyi silmek istediğine emin misin?')) return;
    try {
      await deleteM.mutateAsync(id);
      toast.success('Silindi');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function pause(id: number) {
    try {
      await pauseM.mutateAsync(id);
      toast.success('Seri duraklatıldı');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function resume(id: number) {
    try {
      await resumeM.mutateAsync(id);
      toast.success('Seri devam ediyor');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const filterBar = filterable ? (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisible(pageSize); }}
          placeholder="Metinde ara…"
          className="pl-8"
        />
      </div>
      {channels.length > 0 && (
        <Select value={channelId} onValueChange={(v) => { setChannelId(v); setVisible(pageSize); }}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CHANNELS}>Tüm kanallar</SelectItem>
            {channels.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <span className="text-xs text-muted-foreground">{filtered.length} kayıt</span>
    </div>
  ) : null;

  if (posts.length === 0 || (filterable && filtered.length === 0)) {
    return (
      <div className="space-y-3">
        {filterBar}
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {posts.length === 0 ? (emptyMessage || 'Kayıt yok.') : 'Filtreye uyan kayıt yok.'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filterBar}
      {shown.map((p) => {
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
                    {p.time_range_minutes > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Shuffle className="h-3 w-3" /> ±{p.time_range_minutes}dk rastgele
                      </Badge>
                    )}
                    {p.cron_expression && (p.occurrence_num > 1 || p.max_occurrences) && (
                      <Badge variant="outline" className="gap-1">
                        <Hash className="h-3 w-3" />
                        {p.occurrence_num}
                        {p.max_occurrences ? `/${p.max_occurrences}` : ''}
                      </Badge>
                    )}
                    {p.recurrence_end && (
                      <Badge variant="outline" className="gap-1">
                        <CalendarX className="h-3 w-3" /> bitiş: {formatDateTime(p.recurrence_end)}
                      </Badge>
                    )}
                    {p.pool_id && (
                      <Badge variant="secondary" className="gap-1">
                        {p.pool_rotation === 'random' ? '🎲' : p.pool_rotation === 'shuffle' ? '🔀' : '🔁'} havuz
                      </Badge>
                    )}
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
                  {onEdit && (p.status === 'pending' || p.status === 'failed') && (
                    <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Düzenle
                    </Button>
                  )}
                  {p.status === 'failed' && (
                    <Button size="sm" variant="default" onClick={() => retry(p.id)}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Tekrar Dene
                    </Button>
                  )}
                  {showSendNow && p.status !== 'sent' && p.status !== 'failed' && (
                    <Button size="sm" variant="secondary" onClick={() => sendNow(p.id)}>
                      <Send className="mr-1 h-3.5 w-3.5" /> Gönder
                    </Button>
                  )}
                  {p.status === 'pending' && p.cron_expression && (
                    <Button size="sm" variant="outline" onClick={() => pause(p.id)}>
                      <Pause className="mr-1 h-3.5 w-3.5" /> Duraklat
                    </Button>
                  )}
                  {p.status === 'paused' && (
                    <Button size="sm" variant="default" onClick={() => resume(p.id)}>
                      <Play className="mr-1 h-3.5 w-3.5" /> Devam Et
                    </Button>
                  )}
                  {p.status === 'sent' && (
                    <Button
                      size="sm"
                      variant={trendOpen === p.id ? 'default' : 'outline'}
                      onClick={() => setTrendOpen(trendOpen === p.id ? null : p.id)}
                    >
                      <TrendingUp className="mr-1 h-3.5 w-3.5" /> Trend
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {trendOpen === p.id && p.status === 'sent' && (
                <div className="mt-3 border-t pt-2">
                  <PostTrendChart postId={p.id} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {filterable && filtered.length > shown.length && (
        <div className="pt-1 text-center">
          <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + pageSize)}>
            Daha fazla göster ({filtered.length - shown.length} kaldı)
          </Button>
        </div>
      )}
    </div>
  );
}
