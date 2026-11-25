import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { setCustomerTransactionLimit } from '@/api/customerBilling';

/** A customer's own monthly transaction limit; null = the plan's. */
export function useSetCustomerTransactionLimit(customerId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit: number | null) => setCustomerTransactionLimit(token!, customerId, limit),
    onSuccess: data => {
      qc.setQueryData(['customer-billing', 'subscription', customerId], data);
      void qc.invalidateQueries({ queryKey: ['customer-billing', 'subscriptions'] });
    },
  });
}
