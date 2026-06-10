import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchGmailAccount } from '@/api/gmail';

export function useGmailAccount(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['gmail-account', companyId],
    queryFn: () => fetchGmailAccount(token!, companyId),
    enabled: !!token && !!companyId,
  });
}
