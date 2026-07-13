import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Eye, Heart, TrendingUp, RefreshCw, Send, Loader2, AlertCircle, Tv, Trash2, FileText, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useStats, useSetViews } from '@/hooks/useStats';
import { formatDateTime } from '@/lib/utils';

function StatCard({
  label, value, icon: Icon, color = 'text-primary',
}: { label: string; value: string | number; icon: any; color?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold">{value}</div>
        </div>
        <Icon className={`h-8 w-8 ${color}`} />
      </CardContent>
    </Card>
  );
}

export function StatsTab() {
  const { data, isLoading, isError, error, refetch } = useStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        İstatistikler yüklenemedi: {(error as Error)?.message}
      </div>
    );
  }
  if (!data) return null;
  const load = () => refetch();

  // Birleşik 7 günlük seri (post + view + reaction)
  const days: Record<string, { day: string; posts: number; views: number; reactions: number }> = {};
  for (const w of data.lastWeek) days[w.day] = { day: w.day, posts: w.posts, views: w.views, reactions: 0 };
  for (const r of data.reactionsTrend) {
    if (!days[r.day]) days[r.day] = { day: r.day, posts: 0, views: 0, reactions: r.reactions };
    else days[r.day].reactions = r.reactions;
  }
  const series = Object.values(days).sort((a, b) => a.day.localeCompare(b.day));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">📊 Dashboard</h2>
          <p className="text-sm text-muted-foreground">Son 7 günün performans özetı</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Yenile
        </Button>
      </div>

      {/* Toplamlar */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Toplam Post" value={data.totals.total_posts} icon={Send} />
        <StatCard label="Gönderildi" value={data.totals.sent} icon={TrendingUp} color="text-emerald-500" />
        <StatCard label="Bekleyen" value={data.totals.pending} icon={RefreshCw} color="text-amber-500" />
        <StatCard label="Başarısız" value={data.totals.failed} icon={AlertCircle} color="text-destructive" />
        <StatCard label="Toplam Görüntülenme" value={data.totals.total_views.toLocaleString('tr-TR')} icon={Eye} color="text-blue-500" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Görüntülenme grafiği */}
        <Card>
          <CardHeader>
            <CardTitle>Son 7 gün — Görüntülenme & Reaction</CardTitle>
            <CardDescription>Günlük toplam view + reaction sayısı</CardDescription>
          </CardHeader>
          <CardContent>
            {series.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Henüz veri yok — birkaç post gönderilince burada gözükecek.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradReactions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="views" name="Görüntülenme" stroke="#3b82f6" fill="url(#gradViews)" />
                  <Area type="monotone" dataKey="reactions" name="Reactions" stroke="#f43f5e" fill="url(#gradReactions)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Günlük post sayısı */}
        <Card>
          <CardHeader>
            <CardTitle>Günlük Post Sayısı</CardTitle>
            <CardDescription>Son 7 günde gönderilen post adedi</CardDescription>
          </CardHeader>
          <CardContent>
            {series.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Henüz veri yok.</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="posts" name="Post" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top posts */}
      <Card>
        <CardHeader>
          <CardTitle>🏆 Top 5 Performans</CardTitle>
          <CardDescription>
            Son 30 gün — view ve reaction'a göre. <i>Not: Bot API view sayısı vermez; manuel girilebilir veya MTProto entegrasyonu gerekir. Reactions otomatik takip edilir.</i>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.topPosts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Henüz performans verisi yok.</div>
          ) : (
            <div className="space-y-2">
              {data.topPosts.map((p, i) => {
                const reactions: Record<string, number> = p.reactions ? JSON.parse(p.reactions) : {};
                const reactionsTotal = Object.values(reactions).reduce((a, b) => a + b, 0);
                return (
                  <div key={p.id} className="flex items-start gap-3 rounded-md border p-3">
                    <div className="text-2xl font-bold text-muted-foreground">#{i + 1}</div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline">📺 {p.channel_name}</Badge>
                        {p.media_type && p.media_type !== 'text' && (
                          <Badge variant="secondary">
                            {p.media_type === 'photo' && <ImageIcon className="mr-1 h-3 w-3" />}
                            {p.media_type === 'video' && <Tv className="mr-1 h-3 w-3" />}
                            {p.media_type === 'document' && <FileText className="mr-1 h-3 w-3" />}
                            {p.media_type}
                          </Badge>
                        )}
                        <span className="text-muted-foreground">{formatDateTime(p.sent_at)}</span>
                      </div>
                      <div className="line-clamp-2 text-sm">{p.text || '(medya gönderisi)'}</div>
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <ManualViewsInput postId={p.id} initialViews={p.views} onUpdated={load} />
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3 text-rose-400" />
                          {reactionsTotal}
                        </span>
                        {Object.entries(reactions).slice(0, 5).map(([k, v]) => (
                          <span key={k}>{k} {v}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per channel */}
      <Card>
        <CardHeader>
          <CardTitle>Kanal Performansı</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.perChannel.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div className="space-y-0.5">
                  <div className="font-medium">{c.name}</div>
                  {c.username && <div className="text-xs text-muted-foreground">@{c.username}</div>}
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <Send className="h-3 w-3" /> {c.posts}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3 text-blue-400" /> {c.views.toLocaleString('tr-TR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ManualViewsInput({
  postId, initialViews, onUpdated,
}: { postId: number; initialViews: number; onUpdated: () => void }) {
  const [v, setV] = useState(String(initialViews || 0));
  const [editing, setEditing] = useState(false);
  const setViews = useSetViews();

  async function save() {
    try {
      await setViews.mutateAsync({ id: postId, views: Number(v) });
      toast.success('Güncellendi');
      setEditing(false);
      onUpdated();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 hover:text-foreground"
        title="Tıkla, manuel view sayısı gir"
      >
        <Eye className="h-3 w-3 text-blue-400" />
        {Number(initialViews || 0).toLocaleString('tr-TR')}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        type="number"
        min={0}
        className="h-6 w-20 text-xs"
        autoFocus
      />
      <Button size="sm" className="h-6 px-2 text-[10px]" onClick={save}>OK</Button>
      <Button size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => setEditing(false)}>İptal</Button>
    </span>
  );
}
