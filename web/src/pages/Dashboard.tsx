import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Radio, LogOut, PencilLine, CalendarDays, History, Tv, BookOpen, BarChart3, Calendar as CalendarIcon, KeyRound, AlertTriangle, ScrollText } from 'lucide-react';
import { toast } from 'sonner';
import type { Post } from '@/lib/types';
import { useMe, useLogout } from '@/hooks/useAuth';
import { usePosts, useRetryPost } from '@/hooks/usePosts';
import { useChannels } from '@/hooks/useChannels';
import { useTemplates } from '@/hooks/useTemplates';
import { ComposeTab } from '@/features/ComposeTab';
import { PostList } from '@/features/PostList';
import { ChannelsTab } from '@/features/ChannelsTab';
import { TemplatesTab } from '@/features/TemplatesTab';
import { StatsTab } from '@/features/StatsTab';
import { CalendarTab } from '@/features/CalendarTab';
import { AuditTab } from '@/features/AuditTab';
import { PasswordDialog } from '@/features/PasswordDialog';

export function DashboardPage() {
  const nav = useNavigate();
  const { data: me } = useMe();
  const { data: channels = [] } = useChannels();
  const { data: templates = [] } = useTemplates();
  const { data: posts = [] } = usePosts();
  const logout = useLogout();
  const retryPost = useRetryPost();

  const [showPw, setShowPw] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [presetDate, setPresetDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('compose');

  function startEdit(p: Post) {
    setEditingPost(p);
    setPresetDate(null);
    setActiveTab('compose');
  }
  function cancelEdit() {
    setEditingPost(null);
  }
  function startCreateOn(date: Date) {
    // Seçilen güne saat 12:00 varsayılan; ComposeTab bunu scheduled_at yapar
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    setEditingPost(null);
    setPresetDate(d.toISOString());
    setActiveTab('compose');
  }

  async function handleLogout() {
    await logout.mutateAsync();
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

  async function retryAllFailed() {
    if (!confirm(`${history.length} başarısız postu yeniden denemeye al?`)) return;
    try {
      await Promise.all(history.map((p) => retryPost.mutateAsync(p.id)));
      toast.success(`${history.length} post tekrar denemeye alındı`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

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
            <Button variant="ghost" size="sm" onClick={handleLogout}>
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

      {showPw && <PasswordDialog onClose={() => setShowPw(false)} />}

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
            <TabsTrigger value="audit" className="gap-1.5">
              <ScrollText className="h-3.5 w-3.5" />
              Günlük
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
                editingPost={editingPost}
                presetDate={presetDate}
                onCancelEdit={cancelEdit}
              />
            )}
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarTab posts={posts} onEdit={startEdit} onCreate={startCreateOn} />
          </TabsContent>

          <TabsContent value="stats">
            <StatsTab />
          </TabsContent>

          <TabsContent value="schedule">
            <PostList
              posts={pending}
              onEdit={startEdit}
              showSendNow
              filterable
              channels={channels}
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
                <Button size="sm" variant="secondary" onClick={retryAllFailed}>
                  🔄 Hepsini Tekrar Dene
                </Button>
              )}
            </div>
            <PostList posts={history} onEdit={startEdit} filterable channels={channels} emptyMessage="Henüz gönderim yok." />
          </TabsContent>

          <TabsContent value="channels">
            <ChannelsTab channels={channels} />
          </TabsContent>

          <TabsContent value="templates">
            <TemplatesTab templates={templates} channels={channels} />
          </TabsContent>

          <TabsContent value="audit">
            <AuditTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
