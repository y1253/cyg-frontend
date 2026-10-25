import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import type { CostRange } from '@/api/aiCosts';
import { fetchAllCustomerCosts } from '@/api/costs';

/** Every customer's whole cost in the period — AI, texts, WhatsApp, calls (ADMIN only). */
export function useCustomerCosts(range: CostRange) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['costs', 'customers', range.from ?? '', range.to ?? ''],
    queryFn: () => fetchAllCustomerCosts(token!, range),
    enabled: !!token,
  });
}
