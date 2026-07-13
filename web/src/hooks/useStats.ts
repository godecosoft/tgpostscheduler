import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import type { DashboardStats } from '@/lib/types';

export function useStats(days = 7) {
  return useQuery({
    queryKey: [...qk.stats, days],
    queryFn: () => api.get<DashboardStats>(`/api/stats/dashboard?days=${days}`),
    refetchInterval: 60_000,
  });
}

export function useSetViews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, views }: { id: number; views: number }) =>
      api.post(`/api/stats/post/${id}/views`, { views }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.stats });
      qc.invalidateQueries({ queryKey: qk.posts });
    },
  });
}
