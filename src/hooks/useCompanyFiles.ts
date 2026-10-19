import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchCompanyFiles } from '@/api/companyFiles';

/** A company's bookkeeping files from cygfinance.com, filed per bank account. */
export function useCompanyFiles(companyId: number, enabled = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['company-files', companyId],
    queryFn: () => fetchCompanyFiles(token!, companyId),
    enabled: !!token && !!companyId && enabled,
    staleTime: 30_000,
  });
}
