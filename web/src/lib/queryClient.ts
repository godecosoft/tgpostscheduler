import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Veri 10 sn "taze" sayılır; sekme değişiminde gereksiz refetch olmaz
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Tüm query key'leri tek yerden — yanlış yazım / dağınık string riskini kaldırır
export const qk = {
  me: ['auth', 'me'] as const,
  channels: ['channels'] as const,
  templates: (channelId?: number | null) =>
    channelId != null ? (['templates', channelId] as const) : (['templates'] as const),
  posts: ['posts'] as const,
  stats: ['stats', 'dashboard'] as const,
  audit: ['audit'] as const,
  health: ['health'] as const,
  pools: ['pools'] as const,
  pool: (id: number) => ['pools', id] as const,
};
