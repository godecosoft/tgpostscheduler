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
  status: 'pending' | 'sent' | 'failed';
  sent_at: string | null;
  error: string | null;
  telegram_message_id: number | null;
  recurring: 'hourly' | 'daily' | 'weekly' | 'monthly' | null;
  created_at: string;
}

export interface Template {
  id: number;
  name: string;
  text: string;
  buttons: string | null;
  created_at: string;
}

export interface ComposeDraft {
  channel_id: number | null;
  text: string;
  photo_path: string | null;
  photo_url: string | null;
  buttons: ButtonGrid;
  scheduled_at: string;
  recurring: '' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  silent: boolean;
  disable_preview: boolean;
}
