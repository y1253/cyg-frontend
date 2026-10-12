import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { savePromoCode, type PromoCodeInput } from '@/api/customerBilling';

/** Create (no id) or update a promo code. */
export function useSavePromoCode() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PromoCodeInput> & { id?: number }) => savePromoCode(token!, data),
    onSettled: () => qc.invalidateQueries({ queryKey: ['customer-billing', 'promo-codes'] }),
  });
}
