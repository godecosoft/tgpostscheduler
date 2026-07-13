import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queryClient';

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  detail: string | null;
}

export function useAudit() {
  return useQuery({
    queryKey: qk.audit,
    queryFn: () => api.get<AuditEntry[]>('/api/audit?limit=300'),
    refetchInterval: 60_000,
  });
}

export interface Health {
  ok: boolean;
  ts: number;
  tz: string;
  server_time: string;
}

export function useHealth() {
  return useQuery({
    queryKey: qk.health,
    queryFn: () => api.get<Health>('/api/health'),
    staleTime: 5 * 60_000,
  });
}
