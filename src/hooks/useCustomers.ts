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
    // Ride out an API restart (a deploy takes ~10-15s) instead of showing an error:
    // 1s, 2s, 4s, 8s.
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
