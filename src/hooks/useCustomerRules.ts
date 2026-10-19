import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomerRules } from '@/api/customerRules';

/** A company's customer bookkeeping rules (the Rules tab). */
export function useCustomerRules(companyId: number, enabled = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer-rules', companyId],
    queryFn: () => fetchCustomerRules(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    staleTime: 30_000,
  });
}
