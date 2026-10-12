import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerPayments } from '@/api/customerBilling';

/** Payment history — every customer's, or one customer's when `customerId` is given (ADMIN only). */
export function useCustomerPayments(customerId?: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer-billing', 'payments', customerId ?? 'all'],
    queryFn: () => fetchCustomerPayments(token!, customerId),
    enabled: !!token,
  });
}
