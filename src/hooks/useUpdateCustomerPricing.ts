import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { updateCustomerPricing } from '@/api/customerBilling';

export function useUpdateCustomerPricing() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cents: number) => updateCustomerPricing(token!, cents),
    onSuccess: data => qc.setQueryData(['customer-billing', 'pricing'], data),
  });
}
