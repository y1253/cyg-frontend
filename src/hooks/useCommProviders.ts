import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCommProviders } from '@/api/commCosts';

/** step12d: the phone / messaging providers and their prices (ADMIN only). */
export function useCommProviders() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['comm-costs', 'providers'],
    queryFn: () => fetchCommProviders(token!),
    enabled: !!token,
  });
}
