import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerCommCost } from '@/api/commCosts';
import type { CostRange } from '@/api/aiCosts';

/** step12d: one customer's phone & text cost, by purpose, with their latest texts and calls. */
export function useCustomerCommCost(customerId: number, range: CostRange) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['comm-costs', 'customer', customerId, range.from ?? '', range.to ?? ''],
    queryFn: () => fetchCustomerCommCost(token!, customerId, range),
    enabled: !!token,
  });
}
