import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryClient';
import type { ButtonGrid, Template } from '@/lib/types';

export interface TemplateInput {
  name: string;
  text: string;
  buttons?: ButtonGrid | null;
  channel_id?: number | null;
}

export function useTemplates() {
  return useQuery({
    queryKey: qk.templates(),
    queryFn: () => api.get<Template[]>('/api/templates'),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TemplateInput) => api.post('/api/templates', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates() }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates() }),
  });
}
