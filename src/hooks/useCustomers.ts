import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCustomers } from '@/api/customers';

/** Every public-site customer (ADMIN only). */
export function useCustomers() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => fetchCustomers(token!),
    enabled: !!token,
  });
}
