import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Loader2 } from 'lucide-react';
import { usePostHistory } from '@/hooks/usePosts';

function shortLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmt(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

export function PostTrendChart({ postId }: { postId: number }) {
  const { data = [], isLoading } = usePostHistory(postId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (data.length < 2) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        Henüz trend için yeterli veri yok — view takibi zamanla veri biriktirir
        (public kanallarda birkaç güncelleme sonrası grafik oluşur).
      </div>
    );
  }

  const series = data.map((p) => ({
    t: shortLabel(p.at),
    views: p.views,
    reactions: p.reactions_total,
  }));

  return (
    <div className="pt-2">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
        Görüntülenme trendi ({data.length} ölçüm)
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={series} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="gradPostViews" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5c872" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#f5c872" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="t" tick={{ fontSize: 9 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 9 }} tickFormatter={fmt} width={40} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(v: number, name: string) => [v.toLocaleString('tr-TR'), name === 'views' ? 'Görüntülenme' : 'Reaksiyon']}
          />
          <Area type="monotone" dataKey="views" name="views" stroke="#f5c872" fill="url(#gradPostViews)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
