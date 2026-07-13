import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import type { ButtonGrid, MediaType, Post } from '@/lib/types';

// Backend'in /api/posts POST & PUT için beklediği gövde.
// Not: media_group/buttons burada henüz JSON string'e çevrilmemiş — api katmanı stringliyor.
export interface PostPayload {
  channel_id: number;
  text: string;
  photo_path: string | null;
  media_type: MediaType;
  media_group: { type: string; path: string; caption?: string }[] | null;
  buttons: ButtonGrid | null;
  parse_mode: string;
  disable_preview: boolean;
  silent: boolean;
  scheduled_at: string;
  recurring: string | null;
  cron_expression: string | null;
  auto_delete_minutes: number | null;
  time_range_minutes: number;
  // Recurring seri limitleri (yalnızca tekrarlı modda dolu)
  max_occurrences?: number | null;
  recurrence_end?: string | null;
  // İçerik havuzu (yalnızca tekrarlı modda)
  pool_id?: number | null;
  pool_rotation?: string | null;
}

function invalidatePostsAndStats(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.posts });
  qc.invalidateQueries({ queryKey: qk.stats });
}

export function usePosts() {
  return useQuery({
    queryKey: qk.posts,
    queryFn: () => api.get<Post[]>('/api/posts'),
    // Pending → sent/failed geçişlerini elle yenilemeden görebilmek için
    refetchInterval: 30_000,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PostPayload) => api.post<{ id: number }>('/api/posts', payload),
    onSuccess: () => invalidatePostsAndStats(qc),
  });
}

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PostPayload }) =>
      api.put(`/api/posts/${id}`, payload),
    onSuccess: () => invalidatePostsAndStats(qc),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/posts/${id}`),
    onSuccess: () => invalidatePostsAndStats(qc),
  });
}

export function useSendNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<{ message_id: number | null }>(`/api/posts/${id}/send-now`),
    onSuccess: () => invalidatePostsAndStats(qc),
  });
}

export function useRetryPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/api/posts/${id}/retry`),
    onSuccess: () => invalidatePostsAndStats(qc),
  });
}

export function usePausePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/api/posts/${id}/pause`),
    onSuccess: () => invalidatePostsAndStats(qc),
  });
}

export function useResumePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/api/posts/${id}/resume`),
    onSuccess: () => invalidatePostsAndStats(qc),
  });
}
