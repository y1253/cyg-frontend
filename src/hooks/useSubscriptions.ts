import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchSubscriptions, type SubscriptionFilter } from '@/api/customerBilling';

/** Every customer's subscription row, narrowed by a filter chip (ADMIN only). */
export function useSubscriptions(status: SubscriptionFilter = 'all') {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer-billing', 'subscriptions', status],
    queryFn: () => fetchSubscriptions(token!, status),
    enabled: !!token,
  });
}
