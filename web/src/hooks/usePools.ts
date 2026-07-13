import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import type { Pool, ButtonGrid, MediaType } from '@/lib/types';

export interface PoolItemInput {
  text?: string;
  photo_path?: string | null;
  media_type?: MediaType | null;
  buttons?: ButtonGrid | null;
}

export function usePools() {
  return useQuery({
    queryKey: qk.pools,
    queryFn: () => api.get<Pool[]>('/api/pools'),
  });
}

export function usePool(id: number | null) {
  return useQuery({
    queryKey: id ? qk.pool(id) : ['pools', 'none'],
    queryFn: () => api.get<Pool>(`/api/pools/${id}`),
    enabled: !!id,
  });
}

export function useCreatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<{ id: number }>('/api/pools', { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pools }),
  });
}

export function useUpdatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.put(`/api/pools/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pools }),
  });
}

export function useDeletePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/pools/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pools }),
  });
}

function invalidatePool(qc: ReturnType<typeof useQueryClient>, poolId: number) {
  qc.invalidateQueries({ queryKey: qk.pool(poolId) });
  qc.invalidateQueries({ queryKey: qk.pools });
}

export function useAddPoolItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, input }: { poolId: number; input: PoolItemInput }) =>
      api.post(`/api/pools/${poolId}/items`, input),
    onSuccess: (_d, v) => invalidatePool(qc, v.poolId),
  });
}

export function useUpdatePoolItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, input }: { poolId: number; itemId: number; input: PoolItemInput }) =>
      api.put(`/api/pools/items/${itemId}`, input),
    onSuccess: (_d, v) => invalidatePool(qc, v.poolId),
  });
}

export function useDeletePoolItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId }: { poolId: number; itemId: number }) =>
      api.del(`/api/pools/items/${itemId}`),
    onSuccess: (_d, v) => invalidatePool(qc, v.poolId),
  });
}
