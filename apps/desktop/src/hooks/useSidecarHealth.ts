import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type { HealthResponse } from '@greenseer/shared';

export function useSidecarHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthResponse>('/health'),
    refetchInterval: 30000,
    retry: 1,
  });
}
