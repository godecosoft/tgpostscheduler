export interface Channel {
  id: number;
  name: string;
  chat_id: string;
  username: string | null;
  note: string | null;
  created_at: string;
}

export interface Button {
  text: string;
  url: string;
}

export type ButtonGrid = Button[][];

export type MediaType =
  | 'text'
  | 'photo'
  | 'video'
  | 'animation'
  | 'sticker'
  | 'audio'
  | 'document'
  | 'media_group';

export interface MediaGroupItem {
  type: 'photo' | 'video' | 'document' | 'audio';
  path: string;
  url?: string;
  caption?: string;
}

export interface UploadResult {
  path: string;
  url: string;
  media_type: MediaType;
  mime: string;
  size: number;
}

export interface Post {
  id: number;
  channel_id: number;
  channel_name?: string;
  channel_username?: string | null;
  text: string;
  photo_path: string | null;
  buttons: string | null;
  parse_mode: 'HTML' | 'MarkdownV2' | string;
  disable_preview: number;
  silent: number;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'failed' | 'deleted';
  sent_at: string | null;
  error: string | null;
  telegram_message_id: number | null;
  recurring: 'hourly' | 'daily' | 'weekly' | 'monthly' | null;
  created_at: string;
  // Yeni alanlar
  media_type: MediaType | null;
  media_group: string | null; // JSON
  cron_expression: string | null;
  auto_delete_minutes: number | null;
  delete_at: string | null;
  views: number;
  reactions: string | null; // JSON {"👍":12,...}
  last_stats_update: string | null;
  time_range_minutes: number;
}

export interface Template {
  id: number;
  name: string;
  text: string;
  buttons: string | null;
  created_at: string;
}

export type ScheduleMode = 'oneoff' | 'interval' | 'weekly' | 'monthly' | 'custom';
export type IntervalUnit = 'minute' | 'hour' | 'day';

export interface ComposeDraft {
  channel_id: number | null;
  text: string;
  media_type: MediaType;
  photo_path: string | null;
  photo_url: string | null;
  media_group: MediaGroupItem[];
  buttons: ButtonGrid;

  // Zamanlama
  scheduled_at: string;          // datetime-local — tek seferlik veya başlangıç
  schedule_mode: ScheduleMode;
  // interval modu
  interval_value: number;
  interval_unit: IntervalUnit;
  // weekly modu
  weekdays: number[];            // 0=Paz, 1=Pzt, ..., 6=Cmt
  weekly_time: string;           // "HH:MM"
  // monthly modu
  monthly_day: number;           // 1-31
  monthly_time: string;          // "HH:MM"
  // custom cron
  cron_expression: string;
  // Tüm modlar için: hesaplanan zamana 0..N dakika rastgele offset ekle
  time_range_minutes: number;

  auto_delete_minutes: number | null;
  silent: boolean;
  disable_preview: boolean;
}

export interface DashboardStats {
  totals: {
    total_posts: number;
    sent: number;
    pending: number;
    failed: number;
    deleted: number;
    total_views: number;
  };
  lastWeek: { day: string; posts: number; views: number }[];
  reactionsTrend: { day: string; reactions: number }[];
  topPosts: {
    id: number;
    text: string;
    sent_at: string;
    views: number;
    reactions: string | null;
    channel_name: string;
    media_type: MediaType | null;
    telegram_message_id: number | null;
  }[];
  perChannel: { id: number; name: string; username: string | null; posts: number; views: number }[];
}
