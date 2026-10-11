import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomer } from '@/api/customers';

/** One public-site customer: profile, sales tax and every statement (ADMIN only). */
export function useCustomer(id: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchCustomer(token!, id),
    enabled: !!token && !!id,
  });
}
