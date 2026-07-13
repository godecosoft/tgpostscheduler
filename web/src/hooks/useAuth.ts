import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryClient';

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<{ username: string }>('/api/auth/me'),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => qc.clear(),
  });
}
