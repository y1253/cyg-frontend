import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchPromoCodes } from '@/api/customerBilling';

/** Live promo codes for the customer app (ADMIN only). */
export function usePromoCodes() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer-billing', 'promo-codes'],
    queryFn: () => fetchPromoCodes(token!),
    enabled: !!token,
  });
}
