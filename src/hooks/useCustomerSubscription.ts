import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerSubscription } from '@/api/customerBilling';

/** One customer's subscription summary (ADMIN only). */
export function useCustomerSubscription(customerId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer-billing', 'subscription', customerId],
    queryFn: () => fetchCustomerSubscription(token!, customerId),
    enabled: !!token && customerId > 0,
  });
}
