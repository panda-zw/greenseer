import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api';
import type { AppSettings } from '@greenseer/shared';

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: () => apiGet<AppSettings>('/settings'),
    staleTime: Infinity,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<AppSettings>) =>
      apiPut<AppSettings>('/settings', settings),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
    },
  });
}
