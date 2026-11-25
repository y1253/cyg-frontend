import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchSubscriptionPlan } from '@/api/customerBilling';

/** The customer site's monthly plan: transaction limit + free-trial allowances (ADMIN only). */
export function useSubscriptionPlan() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer-billing', 'plan'],
    queryFn: () => fetchSubscriptionPlan(token!),
    enabled: !!token,
  });
}
