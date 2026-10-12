import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { deletePromoCode } from '@/api/customerBilling';

export function useDeletePromoCode() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deletePromoCode(token!, id),
    onSettled: () => qc.invalidateQueries({ queryKey: ['customer-billing', 'promo-codes'] }),
  });
}
