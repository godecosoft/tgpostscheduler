import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import type { Channel } from '@/lib/types';

export interface ChannelInput {
  name: string;
  chat_id: string;
  username?: string;
  note?: string;
}

export function useChannels() {
  return useQuery({
    queryKey: qk.channels,
    queryFn: () => api.get<Channel[]>('/api/channels'),
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChannelInput) => api.post('/api/channels', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.channels }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ChannelInput & { id: number }) =>
      api.put(`/api/channels/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.channels }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/channels/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.channels });
      qc.invalidateQueries({ queryKey: qk.posts });
    },
  });
}

export function useTestChannel() {
  return useMutation({
    mutationFn: (id: number) => api.post(`/api/channels/${id}/test`),
  });
}
