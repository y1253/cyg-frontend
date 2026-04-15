import { useQuery } from '@tanstack/react-query';
import { fetchCompanies } from '@/api/companies';
import { useAuth } from '@/context/AuthContext';

export function useCompanies() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['companies'],
    queryFn: () => fetchCompanies(token!),
    enabled: !!token,
  });
}
