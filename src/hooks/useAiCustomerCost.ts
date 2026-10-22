import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerCost, type CostRange } from '@/api/aiCosts';

/** step12: one customer's AI cost, by feature and by model (ADMIN only). */
export function useAiCustomerCost(customerId: number, range: CostRange) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['ai-costs', 'customer', customerId, range.from ?? '', range.to ?? ''],
    queryFn: () => fetchCustomerCost(token!, customerId, range),
    enabled: !!token,
  });
}
