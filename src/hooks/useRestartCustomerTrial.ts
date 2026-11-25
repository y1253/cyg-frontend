import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { restartCustomerTrial } from '@/api/customerBilling';

/** Give a customer the whole free trial again (usage counts from now). */
export function useRestartCustomerTrial(customerId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => restartCustomerTrial(token!, customerId),
    onSuccess: data => {
      qc.setQueryData(['customer-billing', 'subscription', customerId], data);
      void qc.invalidateQueries({ queryKey: ['customer-billing', 'subscriptions'] });
    },
  });
}
