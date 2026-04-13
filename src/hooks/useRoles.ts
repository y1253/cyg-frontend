import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { fetchRoles } from '../api/users';

export function useRoles() {
  const { token } = useAuth();
  return useQuery<string[]>({
    queryKey: ['roles'],
    queryFn: () => fetchRoles(token!),
    enabled: !!token,
    staleTime: Infinity,
  });
}
