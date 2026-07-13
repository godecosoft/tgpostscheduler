import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryClient';

export interface Me {
  username: string;
  default_password?: boolean;
}

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<Me>('/api/auth/me'),
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

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { current_password: string; new_password: string }) =>
      api.post('/api/auth/change-password', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}
