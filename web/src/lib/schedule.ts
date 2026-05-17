import type { ComposeDraft, ScheduleMode } from './types';

/**
 * Compose draft'tan bir cron expression üretir.
 * Tek seferlik (oneoff) modda null döner — cron yok, sadece scheduled_at kullanılır.
 */
export function buildCron(draft: ComposeDraft): string | null {
  switch (draft.schedule_mode) {
    case 'oneoff':
      return null;

    case 'interval': {
      const n = Math.max(1, draft.interval_value || 1);
      const [h, m] = (draft.interval_time || '12:00').split(':').map((x) => Number(x) || 0);
      if (draft.interval_unit === 'minute') return `*/${n} * * * *`;
      if (draft.interval_unit === 'hour') {
        // Her N saatte bir, dakikası HH:MM'nin dakikasıyla
        return `${m} */${n} * * *`;
      }
      // 'day' — her N günde bir, HH:MM'de fire
      return `${m} ${h} */${n} * *`;
    }

    case 'weekly': {
      const days = draft.weekdays.length > 0 ? draft.weekdays : [1]; // default Pzt
      const [h, m] = (draft.weekly_time || '12:00').split(':').map(Number);
      // cron weekday: 0=Sun ... 6=Sat (POSIX)
      return `${m || 0} ${h || 12} * * ${days.sort((a, b) => a - b).join(',')}`;
    }

    case 'monthly': {
      const d = Math.max(1, Math.min(31, draft.monthly_day || 1));
      const [h, m] = (draft.monthly_time || '12:00').split(':').map(Number);
      return `${m || 0} ${h || 12} ${d} * *`;
    }

    case 'custom':
      return draft.cron_expression.trim() || null;
  }
}

/**
 * Verilen cron expression'a göre `from` tarihinden sonraki en yakın N firing'i hesaplar.
 * Browser-side, cron-parser kütüphanesine ihtiyaç duymaz — sadece dakika tarama.
 */
export function nextFirings(cron: string, from: Date = new Date(), count = 3): Date[] {
  if (!cron) return [];
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return [];

  const [minSpec, hourSpec, domSpec, monSpec, dowSpec] = parts;

  const matchField = (val: number, spec: string, min: number, max: number): boolean => {
    if (spec === '*') return true;
    // a,b,c
    if (spec.includes(',')) {
      return spec.split(',').some((s) => matchField(val, s.trim(), min, max));
    }
    // */N
    if (spec.startsWith('*/')) {
      const step = parseInt(spec.slice(2), 10);
      if (!step || step <= 0) return false;
      return (val - min) % step === 0;
    }
    // a-b
    if (spec.includes('-')) {
      const [a, b] = spec.split('-').map(Number);
      return val >= a && val <= b;
    }
    // single number
    return Number(spec) === val;
  };

  const matches = (d: Date): boolean => {
    const min = d.getMinutes();
    const hr = d.getHours();
    const dom = d.getDate();
    const mon = d.getMonth() + 1;
    const dow = d.getDay();
    return (
      matchField(min, minSpec, 0, 59) &&
      matchField(hr, hourSpec, 0, 23) &&
      matchField(dom, domSpec, 1, 31) &&
      matchField(mon, monSpec, 1, 12) &&
      matchField(dow, dowSpec, 0, 6)
    );
  };

  const results: Date[] = [];
  // En fazla 90 gün ileri tara (1 minute step) — interval modu için yeterli
  // Performans için: önce başlangıç dakikasına yuvarla
  const cur = new Date(from);
  cur.setSeconds(0, 0);
  cur.setMinutes(cur.getMinutes() + 1);

  const limit = new Date(from);
  limit.setDate(limit.getDate() + 90);

  while (cur <= limit && results.length < count) {
    if (matches(cur)) {
      results.push(new Date(cur));
    }
    cur.setMinutes(cur.getMinutes() + 1);
  }
  return results;
}

export const WEEKDAY_LABELS = [
  { num: 1, short: 'Pzt', full: 'Pazartesi' },
  { num: 2, short: 'Sal', full: 'Salı' },
  { num: 3, short: 'Çar', full: 'Çarşamba' },
  { num: 4, short: 'Per', full: 'Perşembe' },
  { num: 5, short: 'Cum', full: 'Cuma' },
  { num: 6, short: 'Cmt', full: 'Cumartesi' },
  { num: 0, short: 'Paz', full: 'Pazar' },
];

export const SCHEDULE_MODE_LABELS: Record<ScheduleMode, string> = {
  oneoff: 'Tek seferlik',
  interval: 'Aralıklı (her X)',
  weekly: 'Haftalık (belirli günler)',
  monthly: 'Aylık (belirli gün)',
  custom: 'Custom Cron (uzman)',
};

/**
 * Verilen base date'e 0..rangeMinutes arası rastgele offset ekler.
 */
export function applyRandomOffset(base: Date, rangeMinutes: number): Date {
  if (!rangeMinutes || rangeMinutes <= 0) return base;
  const offset = Math.floor(Math.random() * rangeMinutes);
  const d = new Date(base);
  d.setMinutes(d.getMinutes() + offset);
  return d;
}

/**
 * Recurring + range birlikte preview için: bir sonraki firing'i çıkar.
 * Range > 0 ise, base ile base+range arası bir aralık döner.
 */
export function nextFiringsWithRange(
  cron: string,
  rangeMinutes: number,
  from: Date = new Date(),
  count = 3,
): { base: Date; rangeEnd: Date | null }[] {
  const bases = nextFirings(cron, from, count);
  return bases.map((base) => ({
    base,
    rangeEnd: rangeMinutes > 0 ? new Date(base.getTime() + rangeMinutes * 60 * 1000) : null,
  }));
}
