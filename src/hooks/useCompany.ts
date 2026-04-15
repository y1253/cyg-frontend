import { useQuery } from '@tanstack/react-query';
import { fetchCompany } from '@/api/companies';
import { useAuth } from '@/context/AuthContext';

export function useCompany(id: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['company', id],
    queryFn: () => fetchCompany(token!, id),
    enabled: !!token && !!id,
  });
}
