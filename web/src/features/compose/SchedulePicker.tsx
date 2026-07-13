import { CalendarDays, Repeat, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ComposeDraft, ScheduleMode, IntervalUnit, Pool } from '@/lib/types';
import { localInputToISO, formatDateTime } from '@/lib/utils';
import { buildCron, nextFiringsWithRange, WEEKDAY_LABELS, SCHEDULE_MODE_LABELS } from '@/lib/schedule';
import { useHealth } from '@/hooks/useSystem';

type UpdateFn = <K extends keyof ComposeDraft>(key: K, value: ComposeDraft[K]) => void;

interface Props {
  draft: ComposeDraft;
  update: UpdateFn;
  pools: Pool[];
}

// Sunucu ve tarayıcı saat dilimini gösterir; farklıysa uyarır.
function TimezoneBadge() {
  const { data: health } = useHealth();
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const serverTz = health?.tz;
  const mismatch = serverTz && serverTz !== browserTz;
  return (
    <Badge
      variant={mismatch ? 'destructive' : 'secondary'}
      className="gap-1 text-[10px] font-normal"
      title={
        mismatch
          ? `Sunucu (${serverTz}) ile tarayıcın (${browserTz}) farklı saat diliminde. Girdiğin saatler tarayıcı saatine göre yorumlanır.`
          : `Saatler ${browserTz} dilimine göre`
      }
    >
      🕒 {serverTz ? `sunucu: ${serverTz}` : browserTz}
      {mismatch ? ` ≠ sen: ${browserTz}` : ''}
    </Badge>
  );
}

// Zamanlama modu seçimi (oneoff/interval/weekly/monthly/custom) + rastgele dağıtım
// + içerik havuzu + seri limitleri + sonraki gönderim önizlemesi.
export function SchedulePicker({ draft, update, pools }: Props) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <Label className="text-base font-semibold">Zamanlama</Label>
        <TimezoneBadge />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Mod</Label>
        <Select
          value={draft.schedule_mode}
          onValueChange={(v) => update('schedule_mode', v as ScheduleMode)}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SCHEDULE_MODE_LABELS) as ScheduleMode[]).map((m) => (
              <SelectItem key={m} value={m}>{SCHEDULE_MODE_LABELS[m]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Mod'a göre dinamik alanlar */}
      {draft.schedule_mode === 'oneoff' && (
        <div className="space-y-2">
          <Label className="text-xs">Tarih & Saat</Label>
          <Input
            type="datetime-local"
            value={draft.scheduled_at}
            onChange={(e) => update('scheduled_at', e.target.value)}
          />
        </div>
      )}

      {draft.schedule_mode === 'interval' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Sıklık</Label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Her</span>
              <Input
                type="number"
                min={1}
                max={999}
                value={draft.interval_value}
                onChange={(e) => update('interval_value', Math.max(1, Number(e.target.value) || 1))}
                className="w-20"
              />
              <Select
                value={draft.interval_unit}
                onValueChange={(v) => update('interval_unit', v as IntervalUnit)}
              >
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minute">dakikada</SelectItem>
                  <SelectItem value="hour">saatte</SelectItem>
                  <SelectItem value="day">günde</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">bir gönder</span>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {[
                { v: 30, u: 'minute', l: '30dk' },
                { v: 1, u: 'hour', l: 'Saatlik' },
                { v: 3, u: 'hour', l: '3 saat' },
                { v: 6, u: 'hour', l: '6 saat' },
                { v: 12, u: 'hour', l: '12 saat' },
                { v: 1, u: 'day', l: 'Günlük' },
                { v: 2, u: 'day', l: '2 günde 1' },
                { v: 7, u: 'day', l: 'Haftalık' },
              ].map((p) => (
                <Button
                  key={`${p.v}-${p.u}`}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={() => {
                    update('interval_value', p.v);
                    update('interval_unit', p.u as IntervalUnit);
                  }}
                >
                  {p.l}
                </Button>
              ))}
            </div>
          </div>

          {/* Saat picker — unit'e göre değişir */}
          {draft.interval_unit === 'day' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Günün saati</Label>
              <Input
                type="time"
                value={draft.interval_time}
                onChange={(e) => update('interval_time', e.target.value)}
                className="max-w-32"
              />
              <p className="text-[11px] text-muted-foreground">
                Her {draft.interval_value} günde bir, bu saatte gönderilir.
              </p>
            </div>
          )}
          {draft.interval_unit === 'hour' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Saatin dakikası</Label>
              <Input
                type="time"
                value={draft.interval_time}
                onChange={(e) => update('interval_time', e.target.value)}
                className="max-w-32"
              />
              <p className="text-[11px] text-muted-foreground">
                Sadece dakika kısmı dikkate alınır (örn. 14:30 → her N saatin :30'unda).
              </p>
            </div>
          )}
        </div>
      )}

      {draft.schedule_mode === 'weekly' && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Günler</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((d) => {
                const active = draft.weekdays.includes(d.num);
                return (
                  <Button
                    key={d.num}
                    type="button"
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 w-12"
                    onClick={() => {
                      const next = active
                        ? draft.weekdays.filter((x) => x !== d.num)
                        : [...draft.weekdays, d.num];
                      update('weekdays', next);
                    }}
                    title={d.full}
                  >
                    {d.short}
                  </Button>
                );
              })}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                onClick={() => update('weekdays', [1, 2, 3, 4, 5])}>Hafta içi</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                onClick={() => update('weekdays', [0, 6])}>Hafta sonu</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]"
                onClick={() => update('weekdays', [0, 1, 2, 3, 4, 5, 6])}>Her gün</Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Saat</Label>
            <Input
              type="time"
              value={draft.weekly_time}
              onChange={(e) => update('weekly_time', e.target.value)}
              className="mt-1.5 max-w-32"
            />
          </div>
        </div>
      )}

      {draft.schedule_mode === 'monthly' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Ayın günü (1-31)</Label>
            <Input
              type="number"
              min={1}
              max={31}
              value={draft.monthly_day}
              onChange={(e) => update('monthly_day', Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
              className="mt-1.5"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Şubat'ta 30/31 yoksa o ay atlanır.
            </p>
          </div>
          <div>
            <Label className="text-xs">Saat</Label>
            <Input
              type="time"
              value={draft.monthly_time}
              onChange={(e) => update('monthly_time', e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>
      )}

      {draft.schedule_mode === 'custom' && (
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <Repeat className="h-3 w-3" /> Cron Expression
          </Label>
          <Input
            value={draft.cron_expression}
            onChange={(e) => update('cron_expression', e.target.value)}
            placeholder="0 12 * * 1-5"
            className="font-mono"
          />
          <div className="flex flex-wrap gap-1">
            {[
              { v: '0 9,18 * * *', l: 'Her gün 09 ve 18' },
              { v: '*/30 * * * *', l: 'Her 30 dk' },
              { v: '0 12 * * 1-5', l: 'Hafta içi öğle' },
              { v: '0 18 * * 5', l: 'Her Cuma 18:00' },
            ].map((p) => (
              <Button key={p.v} type="button" variant="outline" size="sm"
                className="h-6 text-[11px]"
                onClick={() => update('cron_expression', p.v)}>
                {p.l}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Format: <code>dakika saat gün ay haftagünü</code> · 0=Pazar, 1-5=Pzt-Cuma
          </p>
        </div>
      )}

      {/* Rastgele dağıtım — her saat picker için ortak */}
      <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
        <Label className="flex items-center gap-1.5 text-xs">
          🎲 Rastgele Dağıt (opsiyonel)
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={0}
            max={1440}
            value={draft.time_range_minutes || 0}
            onChange={(e) => update('time_range_minutes', Math.max(0, Number(e.target.value) || 0))}
            className="max-w-24"
          />
          <span className="text-xs text-muted-foreground">dakika içinde</span>
          {[0, 15, 30, 60, 120, 240].map((m) => (
            <Button
              key={m}
              type="button"
              variant={draft.time_range_minutes === m ? 'default' : 'outline'}
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => update('time_range_minutes', m)}
            >
              {m === 0 ? 'Yok' : m < 60 ? `±${m}dk` : `±${m / 60}sa`}
            </Button>
          ))}
        </div>
        {draft.time_range_minutes > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Her gönderim, baz saatten 0–{draft.time_range_minutes} dk sonra <b>rastgele</b> bir saatte yapılır.
          </p>
        )}
      </div>

      {/* İçerik havuzu — sadece tekrarlı modlarda */}
      {draft.schedule_mode !== 'oneoff' && (
        <div className="space-y-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-2.5">
          <label className="flex items-center gap-2 text-xs font-medium">
            <Checkbox
              checked={!!draft.pool_id}
              onCheckedChange={(v) =>
                update('pool_id', v ? (pools[0]?.id ?? null) : null)
              }
            />
            <Layers className="h-3.5 w-3.5" /> İçerik havuzundan gönder
          </label>
          {draft.pool_id != null && (
            pools.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Henüz havuz yok — "Havuzlar" sekmesinden oluştur.
              </p>
            ) : (
              <div className="space-y-2">
                <Select
                  value={draft.pool_id ? String(draft.pool_id) : ''}
                  onValueChange={(v) => update('pool_id', Number(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Havuz seç" /></SelectTrigger>
                  <SelectContent>
                    {pools.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} ({p.item_count ?? 0} öğe)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1.5">
                  {(['sequential', 'random', 'shuffle'] as const).map((r) => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={draft.pool_rotation === r ? 'default' : 'outline'}
                      className="h-7 text-[11px]"
                      onClick={() => update('pool_rotation', r)}
                    >
                      {r === 'sequential' ? '🔁 Sırayla' : r === 'random' ? '🎲 Rastgele' : '🔀 Karışık (tekrarsız)'}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {draft.pool_rotation === 'sequential' &&
                    'Havuzdaki sıraya göre birer birer atar, sona gelince başa döner.'}
                  {draft.pool_rotation === 'random' &&
                    'Her seferinde rastgele seçer — aynı içerik peş peşe/yakın çıkabilir.'}
                  {draft.pool_rotation === 'shuffle' &&
                    'Rastgele ama tekrarsız: tüm öğeler bir kez atılmadan hiçbiri tekrar etmez, tur bitince yeniden karışır.'}
                  {' '}Yukarıdaki metin/medya alanları yok sayılır.
                </p>
              </div>
            )
          )}
        </div>
      )}

      {/* Seri limitleri — sadece tekrarlı modlarda */}
      {draft.schedule_mode !== 'oneoff' && (
        <div className="space-y-2 rounded-md border border-dashed p-2.5">
          <Label className="flex items-center gap-1.5 text-xs">
            <Repeat className="h-3 w-3" /> Seri Limiti (opsiyonel — boşsa sonsuz)
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Max gönderim sayısı</span>
              <Input
                type="number"
                min={1}
                placeholder="Sınırsız"
                value={draft.max_occurrences ?? ''}
                onChange={(e) =>
                  update('max_occurrences', e.target.value ? Math.max(1, Number(e.target.value)) : null)
                }
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Bitiş tarihi</span>
              <Input
                type="datetime-local"
                value={draft.recurrence_end}
                onChange={(e) => update('recurrence_end', e.target.value)}
              />
            </div>
          </div>
          {(draft.max_occurrences || draft.recurrence_end) && (
            <p className="text-[11px] text-muted-foreground">
              Seri
              {draft.max_occurrences ? ` ${draft.max_occurrences} gönderimden sonra` : ''}
              {draft.max_occurrences && draft.recurrence_end ? ' veya' : ''}
              {draft.recurrence_end ? ` ${formatDateTime(localInputToISO(draft.recurrence_end))} sonrasında` : ''}{' '}
              otomatik durur.
            </p>
          )}
        </div>
      )}

      {/* Sonraki gönderim önizlemesi */}
      <SchedulePreview draft={draft} />
    </div>
  );
}

function SchedulePreview({ draft }: { draft: ComposeDraft }) {
  const cron = buildCron(draft);
  const range = draft.time_range_minutes || 0;

  if (draft.schedule_mode === 'oneoff') {
    if (!draft.scheduled_at) return null;
    const d = new Date(localInputToISO(draft.scheduled_at));
    const diff = d.getTime() - Date.now();
    if (diff < 0) {
      return (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
          ⚠️ Seçtiğin tarih geçmişte — kaydedince hemen gönderilir.
        </div>
      );
    }
    if (range > 0) {
      const end = new Date(d.getTime() + range * 60 * 1000);
      return (
        <div className="rounded-md bg-primary/10 px-3 py-2 text-xs">
          📅 <b>Gönderim aralığı:</b> {formatDateTime(d.toISOString())} — {formatDateTime(end.toISOString())}
          <div className="text-[10px] text-muted-foreground">Bu aralık içinde rastgele bir saatte gönderilecek.</div>
        </div>
      );
    }
    return (
      <div className="rounded-md bg-primary/10 px-3 py-2 text-xs">
        📅 <b>Gönderim:</b> {formatDateTime(d.toISOString())}
      </div>
    );
  }

  if (!cron) {
    return (
      <div className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
        ⚠️ Zamanlama bilgisi eksik.
      </div>
    );
  }

  const nexts = nextFiringsWithRange(cron, range, new Date(), 3);
  if (nexts.length === 0) {
    return (
      <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
        ⚠️ Bu pattern'a uyan firing bulunamadı (90 gün içinde).
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-md bg-primary/10 px-3 py-2 text-xs">
      <div className="flex items-center gap-1 font-medium">
        🔁 <span>Sonraki gönderimler:</span>
        <code className="ml-auto rounded bg-background/50 px-1.5 py-0.5 text-[10px]">{cron}</code>
      </div>
      <ul className="space-y-0.5 pl-4 text-muted-foreground">
        {nexts.map(({ base, rangeEnd }, i) => (
          <li key={i}>
            {i + 1}. {formatDateTime(base.toISOString())}
            {rangeEnd && (
              <span className="opacity-70"> — {formatDateTime(rangeEnd.toISOString())} arası rastgele</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
