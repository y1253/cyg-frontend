import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { updateSubscriptionPlan, type SubscriptionPlanInput } from '@/api/customerBilling';

/** Save the plan; every subscription row's limit / trial usage depends on it. */
export function useUpdateSubscriptionPlan() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SubscriptionPlanInput>) => updateSubscriptionPlan(token!, data),
    onSuccess: data => {
      qc.setQueryData(['customer-billing', 'plan'], data);
      void qc.invalidateQueries({ queryKey: ['customer-billing', 'subscriptions'] });
      void qc.invalidateQueries({ queryKey: ['customer-billing', 'subscription'] });
    },
  });
}
