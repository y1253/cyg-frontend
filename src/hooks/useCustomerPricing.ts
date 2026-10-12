import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerPricing } from '@/api/customerBilling';

/** The customer app's Generate price (ADMIN only). */
export function useCustomerPricing() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer-billing', 'pricing'],
    queryFn: () => fetchCustomerPricing(token!),
    enabled: !!token,
  });
}
