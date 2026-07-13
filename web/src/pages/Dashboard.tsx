import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Radio, LogOut, PencilLine, CalendarDays, History, Tv, BookOpen, BarChart3, Calendar as CalendarIcon, KeyRound, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Channel, Post, Template } from '@/lib/types';
import { ComposeTab } from '@/features/ComposeTab';
import { PostList } from '@/features/PostList';
import { ChannelsTab } from '@/features/ChannelsTab';
import { TemplatesTab } from '@/features/TemplatesTab';
import { StatsTab } from '@/features/StatsTab';
import { CalendarTab } from '@/features/CalendarTab';
import { PasswordDialog } from '@/features/PasswordDialog';

export function DashboardPage() {
  const nav = useNavigate();
  const [me, setMe] = useState<{ username: string; default_password?: boolean } | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [activeTab, setActiveTab] = useState('compose');

  function startEdit(p: Post) {
    setEditingPost(p);
    setActiveTab('compose');
  }
  function cancelEdit() {
    setEditingPost(null);
  }

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

  const loadMe = useCallback(() => {
    api
      .get<{ username: string; default_password?: boolean }>('/api/auth/me')
      .then(setMe)
      .catch(() => nav('/login'));
  }, [nav]);

  useEffect(() => {
    loadMe();
    refresh();
  }, [loadMe, refresh]);

  async function logout() {
    await api.post('/api/auth/logout');
    nav('/login');
  }

  // "Zamanlanmış" sekmesi: bekleyen + duraklatılmış seriler
  const pending = useMemo(
    () => posts.filter((p) => p.status === 'pending' || p.status === 'paused'),
    [posts],
  );
  const history = useMemo(() => {
    const done = posts.filter((p) => p.status !== 'pending' && p.status !== 'paused');
    if (historyFilter === 'all') return done;
    return done.filter((p) => p.status === historyFilter);
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
            <Button variant="ghost" size="sm" onClick={() => setShowPw(true)}>
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              Parola
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              Çıkış
            </Button>
          </div>
        </div>
        {me?.default_password && (
          <div className="border-t bg-destructive/10 text-destructive">
            <div className="container flex items-center gap-2 py-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                Varsayılan parola kullanılıyor — güvenlik riski.{' '}
                <button className="font-semibold underline" onClick={() => setShowPw(true)}>
                  Hemen değiştir
                </button>
              </span>
            </div>
          </div>
        )}
      </header>

      {showPw && <PasswordDialog onClose={() => setShowPw(false)} onChanged={loadMe} />}

      <main className="container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto flex-wrap gap-1 bg-muted/40 p-1">
            <TabsTrigger value="compose" className="gap-1.5">
              <PencilLine className="h-3.5 w-3.5" />
              {editingPost ? `Düzenle #${editingPost.id}` : 'Gönderi Oluştur'}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              Takvim
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
              <ComposeTab
                channels={channels}
                templates={templates}
                onSaved={refresh}
                editingPost={editingPost}
                onCancelEdit={cancelEdit}
              />
            )}
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarTab posts={posts} onChanged={refresh} onEdit={startEdit} />
          </TabsContent>

          <TabsContent value="stats">
            <StatsTab />
          </TabsContent>

          <TabsContent value="schedule">
            <PostList
              posts={pending}
              onChanged={refresh}
              onEdit={startEdit}
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
            <PostList posts={history} onChanged={refresh} onEdit={startEdit} emptyMessage="Henüz gönderim yok." />
          </TabsContent>

          <TabsContent value="channels">
            <ChannelsTab channels={channels} onChanged={refresh} />
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesTab templates={templates} channels={channels} onChanged={refresh} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
