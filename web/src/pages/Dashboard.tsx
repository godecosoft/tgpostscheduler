import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Radio, LogOut, PencilLine, CalendarDays, History, Tv, BookOpen, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Channel, Post, Template } from '@/lib/types';
import { ComposeTab } from '@/features/ComposeTab';
import { PostList } from '@/features/PostList';
import { ChannelsTab } from '@/features/ChannelsTab';
import { TemplatesTab } from '@/features/TemplatesTab';
import { StatsTab } from '@/features/StatsTab';

export function DashboardPage() {
  const nav = useNavigate();
  const [me, setMe] = useState<{ username: string } | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all');

  const refresh = useCallback(async () => {
    try {
      const [c, t, p] = await Promise.all([
        api.get<Channel[]>('/api/channels'),
        api.get<Template[]>('/api/templates'),
        api.get<Post[]>('/api/posts'),
      ]);
      setChannels(c);
      setTemplates(t);
      setPosts(p);
    } catch (e: any) {
      toast.error('Veri yüklenemedi: ' + e.message);
    }
  }, []);

  useEffect(() => {
    api
      .get<{ username: string }>('/api/auth/me')
      .then(setMe)
      .catch(() => nav('/login'));
    refresh();
  }, [nav, refresh]);

  async function logout() {
    await api.post('/api/auth/logout');
    nav('/login');
  }

  const pending = useMemo(() => posts.filter((p) => p.status === 'pending'), [posts]);
  const history = useMemo(() => {
    const sent = posts.filter((p) => p.status !== 'pending');
    if (historyFilter === 'all') return sent;
    return sent.filter((p) => p.status === historyFilter);
  }, [posts, historyFilter]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Radio className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">ARS Scheduler</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Telegram Yönetimi
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {me && <Badge variant="secondary">{me.username}</Badge>}
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Çıkış
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="compose">
          <TabsList className="h-auto flex-wrap gap-1 bg-muted/40 p-1">
            <TabsTrigger value="compose" className="gap-1.5">
              <PencilLine className="h-3.5 w-3.5" />
              Gönderi Oluştur
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              İstatistikler
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Zamanlanmış
              {pending.length > 0 && (
                <Badge variant="default" className="ml-1 h-5 px-1.5 text-[10px]">
                  {pending.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="h-3.5 w-3.5" />
              Geçmiş
            </TabsTrigger>
            <TabsTrigger value="channels" className="gap-1.5">
              <Tv className="h-3.5 w-3.5" />
              Kanallar
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {channels.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Şablonlar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose">
            {channels.length === 0 ? (
              <div className="rounded-lg border border-dashed py-16 text-center">
                <p className="mb-3 text-muted-foreground">Önce bir kanal eklemelisin.</p>
                <p className="text-xs text-muted-foreground">
                  "Kanallar" sekmesinden başlayabilirsin.
                </p>
              </div>
            ) : (
              <ComposeTab channels={channels} templates={templates} onSaved={refresh} />
            )}
          </TabsContent>

          <TabsContent value="stats">
            <StatsTab />
          </TabsContent>

          <TabsContent value="schedule">
            <PostList
              posts={pending}
              onChanged={refresh}
              showSendNow
              emptyMessage="Bekleyen gönderi yok."
            />
          </TabsContent>

          <TabsContent value="history">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(['all', 'sent', 'failed'] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={historyFilter === f ? 'default' : 'outline'}
                  onClick={() => setHistoryFilter(f)}
                >
                  {f === 'all' ? 'Tümü' : f === 'sent' ? 'Gönderildi' : 'Başarısız'}
                </Button>
              ))}
              {historyFilter === 'failed' && history.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    if (!confirm(`${history.length} başarısız postu yeniden denemeye al?`)) return;
                    try {
                      await Promise.all(
                        history.map((p) =>
                          fetch(`/api/posts/${p.id}/retry`, { method: 'POST', credentials: 'include' }),
                        ),
                      );
                      toast.success(`${history.length} post tekrar denemeye alındı`);
                      refresh();
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  🔄 Hepsini Tekrar Dene
                </Button>
              )}
            </div>
            <PostList posts={history} onChanged={refresh} emptyMessage="Henüz gönderim yok." />
          </TabsContent>

          <TabsContent value="channels">
            <ChannelsTab channels={channels} onChanged={refresh} />
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesTab templates={templates} onChanged={refresh} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
