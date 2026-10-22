import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerCosts, type CostRange } from '@/api/aiCosts';

/** step12: every customer's AI cost in the period (ADMIN only). */
export function useAiCustomerCosts(range: CostRange) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['ai-costs', 'customers', range.from ?? '', range.to ?? ''],
    queryFn: () => fetchCustomerCosts(token!, range),
    enabled: !!token,
  });
}
