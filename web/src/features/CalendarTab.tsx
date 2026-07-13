import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Pencil, Trash2, Send, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { nextFirings } from '@/lib/schedule';
import type { Post } from '@/lib/types';
import { useSendNow, useRetryPost, useDeletePost } from '@/hooks/usePosts';

interface Props {
  posts: Post[];
  onEdit?: (post: Post) => void;
}

interface CalendarEvent {
  date: Date;
  post: Post;
  projected: boolean; // gerçek post mu, yoksa cron'dan üretilmiş mi
}

const WEEKDAY_HEADERS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function CalendarTab({ posts, onEdit }: Props) {
  const [cursor, setCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);

  // Grid: önceki ayın günleri dahil 6 hafta = 42 gün
  const firstWeekday = (monthStart.getDay() + 6) % 7; // Pzt=0
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  const days: Date[] = [];
  const cur = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  // Tüm event'leri topla: gerçek postlar + recurring projection
  const events: CalendarEvent[] = useMemo(() => {
    const list: CalendarEvent[] = [];
    const lastVisible = days[days.length - 1];

    for (const p of posts) {
      // 1) Gerçek post
      if (p.scheduled_at) {
        const d = new Date(p.scheduled_at);
        if (d >= gridStart && d <= lastVisible) {
          list.push({ date: d, post: p, projected: false });
        }
      }
      // 2) Cron'lu pending postlar için ileri projeksiyon
      if (p.cron_expression && p.status === 'pending') {
        const projection = nextFirings(p.cron_expression, new Date(), 60);
        for (const d of projection) {
          if (d > lastVisible) break;
          // Aynı tarihteki "gerçek" post zaten yukarıda eklendi → atla
          if (sameDay(d, new Date(p.scheduled_at))) continue;
          list.push({ date: d, post: p, projected: true });
        }
      }
    }
    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [posts, gridStart.getTime(), days[days.length - 1].getTime()]);

  function eventsOnDay(d: Date): CalendarEvent[] {
    return events.filter((e) => sameDay(e.date, d));
  }

  const dayEvents = selectedDay ? eventsOnDay(selectedDay) : [];

  function navigate(dir: -1 | 0 | 1) {
    if (dir === 0) {
      setCursor(new Date());
      setSelectedDay(null);
      return;
    }
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + dir);
    setCursor(next);
    setSelectedDay(null);
  }

  const monthLabel = cursor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,400px)]">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <span className="capitalize">{monthLabel}</span>
            </CardTitle>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(0)}>
                Bugün
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
            {WEEKDAY_HEADERS.map((h) => (
              <div key={h}>{h}</div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const isCurrMonth = d.getMonth() === cursor.getMonth();
              const isToday = sameDay(d, new Date());
              const isSelected = selectedDay && sameDay(d, selectedDay);
              const dayEvts = eventsOnDay(d);
              const hasReal = dayEvts.some((e) => !e.projected);
              const hasProjected = dayEvts.some((e) => e.projected);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDay(d)}
                  className={
                    'group relative flex min-h-[64px] flex-col rounded-md border p-1 text-left text-xs transition ' +
                    (isCurrMonth ? 'bg-background' : 'bg-muted/30 opacity-50') +
                    (isSelected ? ' ring-2 ring-primary' : '') +
                    (isToday ? ' border-primary' : ' border-border') +
                    ' hover:bg-accent'
                  }
                >
                  <div className={'mb-1 ' + (isToday ? 'font-bold text-primary' : '')}>
                    {d.getDate()}
                  </div>
                  {dayEvts.length > 0 && (
                    <div className="space-y-0.5">
                      {hasReal && (
                        <div className="rounded bg-primary/20 px-1 py-0.5 text-[10px] text-primary">
                          {dayEvts.filter((e) => !e.projected).length} post
                        </div>
                      )}
                      {hasProjected && (
                        <div className="rounded border border-dashed border-amber-500/50 px-1 py-0.5 text-[10px] text-amber-600">
                          {dayEvts.filter((e) => e.projected).length} tekrarlı
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded bg-primary/40" /> Zamanlanmış post
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded border border-dashed border-amber-500" /> Tekrarlı projeksiyon
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedDay
              ? selectedDay.toLocaleDateString('tr-TR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : 'Bir gün seç'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedDay && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Detayları görmek için takvimden bir güne tıkla.
            </div>
          )}
          {selectedDay && dayEvents.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Bu gün için zamanlanmış post yok.
            </div>
          )}
          {dayEvents.length > 0 && (
            <div className="space-y-2">
              {dayEvents.map((e, i) => (
                <DayEventCard
                  key={`${e.post.id}-${i}`}
                  evt={e}
                  onEdit={onEdit}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DayEventCard({
  evt,
  onEdit,
}: {
  evt: CalendarEvent;
  onEdit?: (p: Post) => void;
}) {
  const { post: p, date, projected } = evt;
  const time = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const sendNowM = useSendNow();
  const retryM = useRetryPost();
  const deleteM = useDeletePost();

  async function remove() {
    if (!confirm('Bu postu sil?')) return;
    try {
      await deleteM.mutateAsync(p.id);
      toast.success('Silindi');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function sendNow() {
    try {
      await sendNowM.mutateAsync(p.id);
      toast.success('Gönderildi');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function retry() {
    try {
      await retryM.mutateAsync(p.id);
      toast.success('Tekrar denemeye alındı');
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className={'rounded-md border p-3 ' + (projected ? 'border-dashed border-amber-500/40 bg-amber-500/5' : '')}>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="font-mono text-primary">{time}</span>
          {projected && (
            <Badge variant="outline" className="text-[10px] text-amber-600">
              tekrarlı projeksiyon
            </Badge>
          )}
        </div>
        <Badge variant={p.status === 'sent' ? 'success' : p.status === 'failed' ? 'destructive' : 'warning'}>
          {p.status}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">📺 {p.channel_name}</div>
      <pre className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap rounded bg-muted/40 p-2 text-[11px]">
        {p.text || '(medya postu)'}
      </pre>
      {!projected && (
        <div className="mt-2 flex flex-wrap gap-1">
          {onEdit && (p.status === 'pending' || p.status === 'failed') && (
            <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
              <Pencil className="mr-1 h-3 w-3" /> Düzenle
            </Button>
          )}
          {p.status === 'pending' && (
            <Button size="sm" variant="secondary" onClick={sendNow}>
              <Send className="mr-1 h-3 w-3" /> Hemen Gönder
            </Button>
          )}
          {p.status === 'failed' && (
            <Button size="sm" onClick={retry}>
              <RotateCcw className="mr-1 h-3 w-3" /> Tekrar Dene
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={remove}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
