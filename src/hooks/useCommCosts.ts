import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCommCosts } from '@/api/commCosts';
import type { CostRange } from '@/api/aiCosts';

/** step12d: every customer's phone & text cost in the period (ADMIN only). */
export function useCommCosts(range: CostRange) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['comm-costs', 'customers', range.from ?? '', range.to ?? ''],
    queryFn: () => fetchCommCosts(token!, range),
    enabled: !!token,
  });
}
