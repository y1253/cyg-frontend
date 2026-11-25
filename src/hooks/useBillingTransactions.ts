import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchBillingTransactions, type BillingTransactionStatus } from '@/api/customerBilling';

/** The subscription money events — every customer's, or one customer's (ADMIN only). */
export function useBillingTransactions(opts: { status?: BillingTransactionStatus | null; customerId?: number } = {}) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer-billing', 'transactions', opts.customerId ?? 'all', opts.status ?? 'all'],
    queryFn: () => fetchBillingTransactions(token!, opts),
    enabled: !!token,
  });
}
