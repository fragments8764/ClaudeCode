import { useQuery } from '@tanstack/react-query';
import { getJson } from './api';

/** Feature flags (config/features.json). Unknown or not-yet-loaded flags default to enabled. */
export function useFeatures() {
  const q = useQuery({ queryKey: ['features'], queryFn: () => getJson<{ data: Record<string, { enabled: boolean; tier: string }> }>('/api/features'), staleTime: 3600_000 });
  return (name: string) => q.data?.data[name]?.enabled !== false;
}
